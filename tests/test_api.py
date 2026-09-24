from pathlib import Path

import httpx
import pytest
from connect4_app import __version__
from connect4_app.app import (
    CLOSE_NO_SESSION,
    CLOSE_ORIGIN_NOT_ALLOWED,
    app,
    origin_allowed,
    resolve_frontend_dist,
)
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
        assert updated.json() == {"nickname": "測試玩家", "locale": "zh-TW"}


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
