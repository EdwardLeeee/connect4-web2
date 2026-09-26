from pathlib import Path

import connect4_app.app as app_module
import httpx
import pytest
from connect4_app import __version__
from connect4_app.app import (
    APP_ORIGINS,
    APP_PROTOCOL,
    CLOSE_NO_SESSION,
    CLOSE_ORIGIN_NOT_ALLOWED,
    TOKEN_PROTOCOL_PREFIX,
    app,
    origin_allowed,
    resolve_frontend_dist,
)
from connect4_app.manager import GameManager
from connect4_app.sessions import SESSION_COOKIE
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

FRONTEND_ROOT_ASSETS = {
    "/connect4-mark.svg": "image/svg+xml",
    "/connect4-mark-32.png": "image/png",
    "/favicon.ico": "image/vnd.microsoft.icon",
    "/apple-touch-icon.png": "image/png",
    "/connect4-icon-192.png": "image/png",
    "/connect4-icon-512.png": "image/png",
    "/connect4-preview.png": "image/png",
    "/site.webmanifest": "application/manifest+json",
}


def test_frontend_dist_can_be_configured(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("CONNECT4_FRONTEND_DIST", str(tmp_path))
    assert resolve_frontend_dist() == tmp_path


@pytest.mark.asyncio
async def test_session_cookie_and_profile_update() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        session = await client.get("/api/session")
        assert session.status_code == 200
        assert SESSION_COOKIE in client.cookies
        updated = await client.patch(
            "/api/session",
            json={"nickname": "測試玩家", "locale": "zh-TW"},
        )
        assert updated.status_code == 200
        assert updated.json() == {"nickname": "測試玩家", "locale": "zh-TW", "created": False}


@pytest.mark.asyncio
async def test_health_proves_exact_solver_is_ready() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["version"] == __version__
    assert __version__ != "0.0.0"  # read from the installed package metadata
    assert response.json()["solver"] == {
        "ready": True,
        "engine": "connect-four-ai",
        "version": "1.0.0",
        "guarantee": "exact-perfect-play",
        "error": None,
        "reply_table": {"loaded": True, "entries": 52_721},
    }


@pytest.mark.asyncio
async def test_spa_is_served_for_client_routes() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/play")
    assert response.status_code == 200
    assert '<div id="app"></div>' in response.text


@pytest.mark.asyncio
async def test_frontend_root_assets_are_served_as_files() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for path, content_type in FRONTEND_ROOT_ASSETS.items():
            response = await client.get(path)
            assert response.status_code == 200
            assert response.headers["content-type"] == content_type
            assert len(response.content) > 100

        manifest = (await client.get("/site.webmanifest")).json()
        assert manifest["display"] == "standalone"
        assert manifest["icons"] == [
            {
                "src": "/connect4-icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/connect4-icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable",
            },
        ]


@pytest.mark.asyncio
async def test_frontend_asset_path_cannot_escape_dist() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/%2E%2E/pyproject.toml")
    assert response.status_code == 200
    assert '<div id="app"></div>' in response.text
    assert "[project]" not in response.text


def test_websocket_origin_must_match_host() -> None:
    assert origin_allowed("https://connect4.example", "connect4.example")
    assert origin_allowed(None, "connect4.example")
    assert not origin_allowed("https://attacker.example", "connect4.example")


def test_websocket_close_codes_are_stable() -> None:
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as missing_session:
        with client.websocket_connect("/ws"):
            pass
    assert missing_session.value.code == CLOSE_NO_SESSION == 4401

    with pytest.raises(WebSocketDisconnect) as foreign_origin:
        with client.websocket_connect("/ws", headers={"origin": "https://attacker.example"}):
            pass
    assert foreign_origin.value.code == CLOSE_ORIGIN_NOT_ALLOWED == 4403


IOS_ORIGIN = "capacitor://localhost"
ANDROID_ORIGIN = "https://localhost"
SITE_ORIGIN = "http://testserver"
FOREIGN_ORIGIN = "https://attacker.example"
PREFLIGHT = {
    "Access-Control-Request-Method": "PATCH",
    "Access-Control-Request-Headers": "authorization, content-type",
}


@pytest.fixture
def fresh_manager(monkeypatch: pytest.MonkeyPatch) -> GameManager:
    fresh = GameManager(ai_min_think_seconds=0)
    monkeypatch.setattr(app_module, "manager", fresh)
    return fresh


def app_headers(origin: str, token: str | None = None) -> dict[str, str]:
    headers = {"Origin": origin}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def app_protocols(token: str) -> list[str]:
    return [APP_PROTOCOL, f"{TOKEN_PROTOCOL_PREFIX}{token}"]


def test_app_origins_default_to_the_capacitor_pages() -> None:
    assert APP_ORIGINS == {IOS_ORIGIN, ANDROID_ORIGIN}


@pytest.mark.parametrize("origin", [IOS_ORIGIN, ANDROID_ORIGIN])
def test_app_gets_a_token_instead_of_a_cookie(fresh_manager: GameManager, origin: str) -> None:
    client = TestClient(app)
    first = client.get("/api/session", headers=app_headers(origin))
    assert first.status_code == 200
    assert "set-cookie" not in first.headers
    assert first.headers["access-control-allow-origin"] == origin
    token = first.json()["token"]

    assert first.json()["created"] is True

    again = client.get("/api/session", headers=app_headers(origin, token))
    assert again.json() == {**first.json(), "created": False}

    renamed = client.patch(
        "/api/session",
        headers=app_headers(origin, token),
        json={"nickname": "App 玩家", "locale": "en"},
    )
    assert renamed.json() == {
        "nickname": "App 玩家",
        "locale": "en",
        "token": token,
        "created": False,
    }
    assert "set-cookie" not in renamed.headers
    assert fresh_manager.sessions.get(token).nickname == "App 玩家"  # type: ignore[union-attr]


def test_app_with_an_unknown_token_gets_a_new_one(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(IOS_ORIGIN, "stale")).json()["token"]
    assert token != "stale"
    assert fresh_manager.sessions.get(token) is not None


def test_a_token_in_the_url_is_ignored(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(IOS_ORIGIN)).json()["token"]
    response = client.get(f"/api/session?token={token}", headers=app_headers(IOS_ORIGIN))
    assert response.json()["token"] != token

    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(
            f"/ws?token={token}", headers=app_headers(IOS_ORIGIN), subprotocols=[APP_PROTOCOL]
        ) as websocket:
            websocket.receive_json()
    assert closed.value.code == CLOSE_NO_SESSION


def test_app_websocket_authenticates_with_the_token_subprotocol(
    fresh_manager: GameManager,
) -> None:
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(ANDROID_ORIGIN)).json()["token"]
    with client.websocket_connect(
        "/ws", headers=app_headers(ANDROID_ORIGIN), subprotocols=app_protocols(token)
    ) as websocket:
        assert websocket.accepted_subprotocol == APP_PROTOCOL
        snapshot = websocket.receive_json()
    assert snapshot["type"] == "state.snapshot"
    session = fresh_manager.sessions.get(token)
    assert session is not None
    assert snapshot["payload"]["session"]["nickname"] == session.nickname


def test_app_websocket_with_a_wrong_token_is_closed_with_4401(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(
            "/ws", headers=app_headers(IOS_ORIGIN), subprotocols=app_protocols("wrong")
        ) as websocket:
            assert websocket.accepted_subprotocol == APP_PROTOCOL
            websocket.receive_json()
    assert closed.value.code == CLOSE_NO_SESSION == 4401


def test_app_recovers_from_a_server_restart(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_module, "manager", GameManager(ai_min_think_seconds=0))
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(IOS_ORIGIN)).json()["token"]

    monkeypatch.setattr(app_module, "manager", GameManager(ai_min_think_seconds=0))
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(
            "/ws", headers=app_headers(IOS_ORIGIN), subprotocols=app_protocols(token)
        ) as websocket:
            websocket.receive_json()
    assert closed.value.code == CLOSE_NO_SESSION

    renewed = client.get("/api/session", headers=app_headers(IOS_ORIGIN, token)).json()["token"]
    assert renewed != token
    with client.websocket_connect(
        "/ws", headers=app_headers(IOS_ORIGIN), subprotocols=app_protocols(renewed)
    ) as websocket:
        assert websocket.receive_json()["type"] == "state.snapshot"


def test_cors_preflight_allows_only_the_app_origins(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    allowed = client.options("/api/session", headers={"Origin": IOS_ORIGIN, **PREFLIGHT})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == IOS_ORIGIN
    assert "PATCH" in allowed.headers["access-control-allow-methods"]
    assert "authorization" in allowed.headers["access-control-allow-headers"].casefold()
    assert "access-control-allow-credentials" not in allowed.headers

    refused = client.options("/api/session", headers={"Origin": FOREIGN_ORIGIN, **PREFLIGHT})
    assert refused.status_code == 400
    assert "access-control-allow-origin" not in refused.headers


def test_foreign_origins_get_no_token_no_cors_and_no_websocket(
    fresh_manager: GameManager,
) -> None:
    client = TestClient(app)
    response = client.get("/api/session", headers=app_headers(FOREIGN_ORIGIN, "guess"))
    assert "token" not in response.json()
    assert "access-control-allow-origin" not in response.headers

    with pytest.raises(WebSocketDisconnect) as rejected:
        with client.websocket_connect(
            "/ws", headers=app_headers(FOREIGN_ORIGIN), subprotocols=app_protocols("guess")
        ):
            pass
    assert rejected.value.code == CLOSE_ORIGIN_NOT_ALLOWED


def test_app_origin_without_the_app_protocol_is_rejected(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as rejected:
        with client.websocket_connect("/ws", headers=app_headers(IOS_ORIGIN)):
            pass
    assert rejected.value.code == CLOSE_ORIGIN_NOT_ALLOWED


def test_site_cookie_flow_is_unchanged(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    first = client.get("/api/session", headers={"Origin": SITE_ORIGIN})
    assert first.json().keys() == {"nickname", "locale", "created"}
    assert "access-control-allow-origin" not in first.headers
    cookie = client.cookies[SESSION_COOKIE]

    patched = client.patch(
        "/api/session",
        headers={"Origin": SITE_ORIGIN, "Authorization": "Bearer ignored"},
        json={"nickname": "網站玩家", "locale": "zh-TW"},
    )
    assert patched.json() == {"nickname": "網站玩家", "locale": "zh-TW", "created": False}
    session = fresh_manager.sessions.get(cookie)
    assert session is not None
    assert session.nickname == "網站玩家"

    with client.websocket_connect("/ws", headers={"Origin": SITE_ORIGIN}) as websocket:
        assert websocket.accepted_subprotocol is None
        snapshot = websocket.receive_json()
    assert snapshot["payload"]["session"]["nickname"] == "網站玩家"


def restart_server(monkeypatch: pytest.MonkeyPatch) -> GameManager:
    """Sessions live in memory, so a restart is a fresh manager behind the same app."""
    fresh = GameManager(ai_min_think_seconds=0)
    monkeypatch.setattr(app_module, "manager", fresh)
    return fresh


def test_site_session_reports_whether_it_was_just_created(
    fresh_manager: GameManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = TestClient(app)
    first = client.get("/api/session", headers={"Origin": SITE_ORIGIN})
    assert first.json()["created"] is True
    cookie = client.cookies[SESSION_COOKIE]

    again = client.get("/api/session", headers={"Origin": SITE_ORIGIN})
    assert again.json()["created"] is False
    assert "set-cookie" not in again.headers

    restart_server(monkeypatch)
    after_restart = client.get("/api/session", headers={"Origin": SITE_ORIGIN})
    assert after_restart.json()["created"] is True
    assert client.cookies[SESSION_COOKIE] != cookie


def test_app_session_reports_whether_it_was_just_created(
    fresh_manager: GameManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = TestClient(app)
    first = client.get("/api/session", headers=app_headers(IOS_ORIGIN)).json()
    assert first["created"] is True

    again = client.get("/api/session", headers=app_headers(IOS_ORIGIN, first["token"])).json()
    assert again["created"] is False
    assert again["token"] == first["token"]

    restart_server(monkeypatch)
    after_restart = client.get(
        "/api/session", headers=app_headers(IOS_ORIGIN, first["token"])
    ).json()
    assert after_restart["created"] is True
    assert after_restart["token"] != first["token"]


def test_site_profile_update_on_a_lost_session_applies_to_the_new_one(
    fresh_manager: GameManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = TestClient(app)
    client.get("/api/session", headers={"Origin": SITE_ORIGIN})
    kept = client.patch(
        "/api/session",
        headers={"Origin": SITE_ORIGIN},
        json={"nickname": "老玩家", "locale": "en"},
    )
    assert kept.json() == {"nickname": "老玩家", "locale": "en", "created": False}
    cookie = client.cookies[SESSION_COOKIE]

    restarted = restart_server(monkeypatch)
    restored = client.patch(
        "/api/session",
        headers={"Origin": SITE_ORIGIN},
        json={"nickname": "老玩家", "locale": "en"},
    )
    assert restored.json() == {"nickname": "老玩家", "locale": "en", "created": True}
    new_cookie = client.cookies[SESSION_COOKIE]
    assert new_cookie != cookie
    assert restarted.sessions.get(new_cookie).nickname == "老玩家"  # type: ignore[union-attr]


def test_app_profile_update_on_a_lost_session_applies_to_the_new_one(
    fresh_manager: GameManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(ANDROID_ORIGIN)).json()["token"]

    restarted = restart_server(monkeypatch)
    restored = client.patch(
        "/api/session",
        headers=app_headers(ANDROID_ORIGIN, token),
        json={"nickname": "App 玩家", "locale": "en"},
    ).json()
    assert restored["created"] is True
    assert restored["token"] != token
    session = restarted.sessions.get(restored["token"])
    assert session is not None
    assert (session.nickname, session.locale) == ("App 玩家", "en")


def test_restoring_an_invalid_nickname_keeps_the_default(fresh_manager: GameManager) -> None:
    client = TestClient(app)
    token = client.get("/api/session", headers=app_headers(IOS_ORIGIN)).json()["token"]
    refused = client.patch(
        "/api/session",
        headers=app_headers(IOS_ORIGIN, token),
        json={"nickname": "x" * 19, "locale": "en"},
    )
    assert refused.status_code == 422
    session = fresh_manager.sessions.get(token)
    assert session is not None
    assert session.nickname.startswith("玩家 ")
    assert session.locale == "zh-TW"
