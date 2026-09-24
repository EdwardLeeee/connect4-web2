from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__
from .manager import GameManager
from .sessions import SESSION_COOKIE

ROOT = Path(__file__).resolve().parents[2]
# WebSocket close codes are part of the client contract; do not renumber them.
CLOSE_NO_SESSION = 4401
CLOSE_ORIGIN_NOT_ALLOWED = 4403


def resolve_frontend_dist() -> Path:
    configured = os.getenv("CONNECT4_FRONTEND_DIST")
    if configured:
        return Path(configured).expanduser().resolve()
    return ROOT / "frontend" / "dist"


FRONTEND_DIST = resolve_frontend_dist()
COOKIE_SECURE = os.getenv("CONNECT4_COOKIE_SECURE", "0") == "1"
ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv("CONNECT4_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
}

app = FastAPI(title="Connect 4", version=__version__)
manager = GameManager()


class SessionUpdate(BaseModel):
    nickname: str
    locale: str = "zh-TW"


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


def session_response(request: Request, response: Response):
    session, created = manager.sessions.resolve(request.cookies.get(SESSION_COOKIE))
    if created:
        set_session_cookie(response, session.id)
    return session, created


@app.get("/api/session")
async def get_session(request: Request, response: Response) -> dict[str, str]:
    session, _ = session_response(request, response)
    return {"nickname": session.nickname, "locale": session.locale}


@app.patch("/api/session")
async def update_session(
    request: Request,
    update: SessionUpdate,
) -> Response:
    session, created = manager.sessions.resolve(request.cookies.get(SESSION_COOKIE))
    try:
        manager.sessions.update(session, update.nickname, update.locale)
    except ValueError as error:
        return JSONResponse({"detail": str(error)}, status_code=422)
    response = JSONResponse({"nickname": session.nickname, "locale": session.locale})
    if created:
        set_session_cookie(response, session.id)
    return response


@app.get("/api/health")
async def health() -> JSONResponse:
    solver_status = manager.solver.status(self_test=True)
    payload = {
        "status": "ok" if solver_status.ready else "degraded",
        "solver": {
            "ready": solver_status.ready,
            "engine": solver_status.engine,
            "version": solver_status.version,
            "guarantee": solver_status.guarantee,
            "error": solver_status.error,
        },
    }
    return JSONResponse(payload, status_code=200 if solver_status.ready else 503)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    if not origin_allowed(websocket.headers.get("origin"), websocket.headers.get("host", "")):
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
