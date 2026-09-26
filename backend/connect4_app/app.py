from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__
from .manager import GameManager
from .sessions import SESSION_COOKIE, UNSET, Session

ROOT = Path(__file__).resolve().parents[2]
# WebSocket close codes are part of the client contract; do not renumber them.
CLOSE_NO_SESSION = 4401
CLOSE_ORIGIN_NOT_ALLOWED = 4403
# Capacitor app pages: iOS serves capacitor://localhost, Android https://localhost.
DEFAULT_APP_ORIGINS = "capacitor://localhost,https://localhost"
# App WebSockets offer this subprotocol plus "connect4.token.<token>"; the server always
# selects APP_PROTOCOL, because a browser fails the connection if none is selected.
APP_PROTOCOL = "connect4.v1"
TOKEN_PROTOCOL_PREFIX = "connect4.token."


def resolve_frontend_dist() -> Path:
    configured = os.getenv("CONNECT4_FRONTEND_DIST")
    if configured:
        return Path(configured).expanduser().resolve()
    return ROOT / "frontend" / "dist"


FRONTEND_DIST = resolve_frontend_dist()
COOKIE_SECURE = os.getenv("CONNECT4_COOKIE_SECURE", "0") == "1"


def parse_origins(value: str) -> set[str]:
    return {origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()}


ALLOWED_ORIGINS = parse_origins(os.getenv("CONNECT4_ALLOWED_ORIGINS", ""))
# An empty value turns app mode off.
APP_ORIGINS = parse_origins(os.getenv("CONNECT4_APP_ORIGINS", DEFAULT_APP_ORIGINS))

app = FastAPI(title="Connect 4", version=__version__)
# Only the app origins may read responses cross-origin. They authenticate with a bearer
# token, never with the site cookie, so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(APP_ORIGINS),
    allow_methods=["GET", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=False,
    max_age=600,
)
manager = GameManager()


class SessionUpdate(BaseModel):
    nickname: str | None = None
    locale: str = "zh-TW"
    # Validated by SessionStore.update, so that a bad value is a 422 invalid_default_number.
    default_number: object = None


def origin_allowed(origin: str | None, host: str) -> bool:
    if not origin:
        return True
    normalized = origin.rstrip("/")
    if normalized in ALLOWED_ORIGINS:
        return True
    try:
        return urlsplit(normalized).netloc.casefold() == host.casefold()
    except ValueError:
        return False


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=60 * 60 * 24 * 30,
    )


def is_app_origin(origin: str | None) -> bool:
    return bool(origin) and origin.rstrip("/") in APP_ORIGINS


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.casefold() != "bearer":
        return None
    return token.strip() or None


def protocol_token(protocols: list[str]) -> str | None:
    for protocol in protocols:
        if protocol.startswith(TOKEN_PROTOCOL_PREFIX):
            return protocol.removeprefix(TOKEN_PROTOCOL_PREFIX) or None
    return None


def resolve_session(request: Request) -> tuple[Session, bool, bool]:
    """Return the session, whether it was just created, and whether an app is asking."""
    if is_app_origin(request.headers.get("origin")):
        # Browsers cannot forge Origin, so the site's own pages never receive a token and
        # the HttpOnly cookie never becomes readable by page scripts.
        session, created = manager.sessions.resolve(bearer_token(request))
        return session, created, True
    session, created = manager.sessions.resolve(request.cookies.get(SESSION_COOKIE))
    return session, created, False


def session_body(
    session: Session, created: bool, app_client: bool
) -> dict[str, str | bool | int | None]:
    # `created` tells a client that its previous session is gone (a server restart, or an
    # expired cookie or token), so it can restore the profile it remembers.
    body: dict[str, str | bool | int | None] = {
        "nickname": session.nickname,
        "locale": session.locale,
        "default_number": session.default_number,
        "created": created,
    }
    if app_client:
        body["token"] = session.id
    return body


@app.get("/api/session")
async def get_session(request: Request, response: Response) -> dict[str, str | bool | int | None]:
    session, created, app_client = resolve_session(request)
    if created and not app_client:
        set_session_cookie(response, session.id)
    return session_body(session, created, app_client)


@app.patch("/api/session")
async def update_session(
    request: Request,
    update: SessionUpdate,
) -> Response:
    session, created, app_client = resolve_session(request)
    try:
        manager.sessions.update(
            session,
            update.nickname,
            update.locale,
            update.default_number if "default_number" in update.model_fields_set else UNSET,
        )
    except ValueError as error:
        return JSONResponse({"detail": str(error)}, status_code=422)
    response = JSONResponse(session_body(session, created, app_client))
    if created and not app_client:
        set_session_cookie(response, session.id)
    return response


@app.get("/api/health")
async def health() -> JSONResponse:
    solver_status = manager.solver.status(self_test=True)
    payload = {
        "status": "ok" if solver_status.ready else "degraded",
        # The deployed application release, so a deploy can confirm what is live.
        "version": __version__,
        "solver": {
            "ready": solver_status.ready,
            "engine": solver_status.engine,
            "version": solver_status.version,
            "guarantee": solver_status.guarantee,
            "error": solver_status.error,
            "reply_table": {
                "loaded": solver_status.reply_table_loaded,
                "entries": solver_status.reply_table_entries,
            },
        },
    }
    return JSONResponse(payload, status_code=200 if solver_status.ready else 503)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    protocols = websocket.scope.get("subprotocols") or []
    if is_app_origin(origin) and APP_PROTOCOL in protocols:
        session = manager.sessions.get(protocol_token(protocols))
        # Accept before closing so the app really receives 4401 and fetches a new token;
        # a close during the handshake reaches browsers only as 1006.
        await websocket.accept(subprotocol=APP_PROTOCOL)
        if not session:
            await websocket.close(
                code=CLOSE_NO_SESSION, reason="Fetch a new token from /api/session"
            )
            return
    else:
        # The site keeps its handshake-time rejections, which browsers report as 1006.
        if not origin_allowed(origin, websocket.headers.get("host", "")):
            await websocket.close(code=CLOSE_ORIGIN_NOT_ALLOWED, reason="Origin not allowed")
            return
        session = manager.sessions.get(websocket.cookies.get(SESSION_COOKIE))
        if not session:
            await websocket.close(
                code=CLOSE_NO_SESSION, reason="Create a session through /api/session first"
            )
            return
        await websocket.accept()
    await manager.connect(session.id, websocket)
    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await manager.send_error(session.id, "invalid_message")
                continue
            await manager.handle(session.id, message)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(session.id, websocket)


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str) -> Response:
    dist_root = FRONTEND_DIST.resolve()
    requested_file = (dist_root / path).resolve()
    if requested_file.is_relative_to(dist_root) and requested_file.is_file():
        return FileResponse(requested_file)

    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return Response(index.read_bytes(), media_type="text/html")
    return JSONResponse(
        {"detail": "Frontend is not built. Run `npm --prefix frontend run dev` for development."},
        status_code=404,
    )
