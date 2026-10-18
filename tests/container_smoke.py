"""Smoke-test the production image the way a deploy and a player would.

CI runs this after `docker build` in the container job, before any image is published
(tag pushes included). It needs only the Python standard library and the docker CLI:
the WebSocket client runs inside the container with the image's own `websockets`.

    python3 tests/container_smoke.py connect4-web:ci
"""

from __future__ import annotations

import importlib.util
import json
import re
import struct
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
NAME = "connect4-smoke"
BASE = "http://127.0.0.1:55580"
HEALTH_SECONDS = 60
# The AI waits at least 1 s per move (AI_MIN_THINK_SECONDS); leave room for a slow runner.
AI_SECONDS = 30

last_response = "(no HTTP response yet)"


class SmokeFailure(Exception):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def docker(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args], input=stdin, capture_output=True, text=True, check=False
    )


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Report a redirect as the response instead of following it (Apple accepts none)."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def request(
    method: str,
    path: str,
    *,
    cookie: str | None = None,
    body: dict[str, Any] | None = None,
    host: str | None = None,
) -> tuple[int, dict[str, str], Any]:
    """One HTTP request; cookies are handled by hand so each check chooses its own.

    `host` sends another Host header, the way Nginx passes on the host a browser asked for.
    """
    global last_response
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if cookie:
        headers["Cookie"] = f"c4_session={cookie}"
    if host:
        headers["Host"] = host
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with OPENER.open(req, timeout=10) as response:
            status, raw, got = response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        status, raw, got = error.code, error.read(), error.headers
    text = raw.decode("utf-8", "replace")
    last_response = f"{method} {host or ''}{path} -> {status}: {text[:500]}"
    try:
        payload: Any = json.loads(text)
    except ValueError:
        payload = text
    return status, {key.lower(): value for key, value in got.items()}, payload


def session_cookie(headers: dict[str, str]) -> str | None:
    match = re.search(r"c4_session=([^;]+)", headers.get("set-cookie", ""))
    return match.group(1) if match else None


def wait_healthy() -> dict[str, Any]:
    deadline = time.monotonic() + HEALTH_SECONDS
    while time.monotonic() < deadline:
        try:
            status, _, body = request("GET", "/api/health")
            if status == 200:
                return body
        except OSError:
            pass  # still starting: connection refused or reset
        time.sleep(1)
    raise SmokeFailure(f"/api/health was not 200 within {HEALTH_SECONDS} s")


def expected_version() -> str:
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"$', pyproject, re.M)
    assert match
    return match.group(1)


def reply_table_entries() -> int:
    """The entry count in the committed table's header (native_solver/src/reply_table.rs)."""
    header = (ROOT / "native_solver" / "data" / "reply-table.bin").read_bytes()[:16]
    return struct.unpack_from("<I", header, 8)[0]


def repo_well_known() -> Any:
    """well_known.py as the repo defines it; it is plain Python, so no install needed."""
    path = ROOT / "backend" / "connect4_app" / "well_known.py"
    spec = importlib.util.spec_from_file_location("well_known", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_association(expected: dict[str, Any], host: str | None = None) -> None:
    status, headers, body = request("GET", "/.well-known/apple-app-site-association", host=host)
    check(status == 200, f"apple-app-site-association answered {status}; Apple needs 200")
    content_type = headers.get("content-type")
    check(content_type == "application/json", f"apple-app-site-association is {content_type}")
    check(body == expected, f"unexpected association: {body}")
    app_ids = body["applinks"]["details"][0]["appIDs"]
    print(f"apple-app-site-association ({host or 'site'}): application/json, appIDs {app_ids}")


def check_app_link_host() -> None:
    """The banner's host: its own association file, and the App Store for everything else."""
    well_known = repo_well_known()
    host = well_known.APP_LINK_HOST
    check_association(well_known.APP_LINK_SITE_ASSOCIATION, host)
    for path in ("/", "/r/ABC123", "/open"):
        status, headers, _ = request("GET", path, host=host)
        check(status == 302, f"{host}{path} answered {status}, not a 302")
        location = headers.get("location")
        check(location == well_known.APP_STORE_URL, f"{host}{path} redirects to {location}")
        check(headers.get("cache-control") == "no-store", f"{host}{path} may be cached")
        check("set-cookie" not in headers, f"{host}{path} set a cookie")
    print(f"{host}: / /r/ABC123 /open -> 302 {well_known.APP_STORE_URL}")


def check_health(health: dict[str, Any]) -> None:
    solver = health["solver"]
    check(health["status"] == "ok", f"health status is {health['status']}")
    check(solver["ready"] is True, f"solver not ready: {solver.get('error')}")
    check(solver["reply_table"]["loaded"] is True, "reply table not loaded")
    check(
        solver["reply_table"]["entries"] == reply_table_entries(),
        f"reply table has {solver['reply_table']['entries']} entries, "
        f"the committed file {reply_table_entries()}",
    )
    check(
        health["version"] == expected_version(),
        f"health reports {health['version']}, pyproject.toml {expected_version()}",
    )


# Runs inside the container, where `websockets` and the native solver are installed.
AI_MOVE_CLIENT = textwrap.dedent(
    """
    import json, os, sys, time
    from websockets.sync.client import connect
    from connect4_app import _solver

    # Columns: game.move takes 0-6 (docs/protocol.md), and best_move returns 0-6 too, as
    # manager.py passes it straight to Game.drop. The snapshot's history records each
    # move as its 1-7 digit, so the human's column 0 is "1".
    HUMAN_COLUMN = 0
    best = _solver.best_move(str(HUMAN_COLUMN + 1))
    expected = str(HUMAN_COLUMN + 1) + str(best + 1)
    # A different digit from the human's, so a reply that echoed the human's column or
    # was off by one could not pass by coincidence.
    assert best != HUMAN_COLUMN, best

    last = None
    deadline = time.monotonic() + float(os.environ["AI_SECONDS"])
    def next_snapshot(ws):
        global last
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"no answer in time; last message: {last}")
            last = json.loads(ws.recv(timeout=remaining))
            if last["type"] == "state.snapshot":
                return last["payload"]

    cookie = "c4_session=" + os.environ["C4_COOKIE"]
    try:
        with connect("ws://127.0.0.1:55555/ws", additional_headers={"Cookie": cookie}) as ws:
            next_snapshot(ws)
            ws.send(json.dumps({"type": "game.ai.start", "payload": {}}))
            game = None
            while not (game and game["status"] == "playing"):
                game = next_snapshot(ws)["game"]
            ws.send(json.dumps({"type": "game.move", "payload": {"column": HUMAN_COLUMN}}))
            while len(game["history"]) < 2:
                game = next_snapshot(ws)["game"]
    except Exception as error:
        print(json.dumps({"error": repr(error), "last": last}))
        sys.exit(1)
    print(json.dumps({"history": game["history"], "expected": expected, "last": last}))
    """
)


def check_ai_move(cookie: str) -> None:
    env = ["-e", f"C4_COOKIE={cookie}", "-e", f"AI_SECONDS={AI_SECONDS}"]
    result = docker("exec", "-i", *env, NAME, "python", "-", stdin=AI_MOVE_CLIENT)
    check(result.returncode == 0, f"AI client failed: {result.stdout}{result.stderr}")
    outcome = json.loads(result.stdout)
    check(
        outcome["history"] == outcome["expected"],
        f"AI answered {outcome['history']}, the solver says {outcome['expected']}: {outcome}",
    )
    print(f"ai move: {outcome['history']} (expected {outcome['expected']})")


def run(image: str) -> None:
    started = docker("run", "--detach", "--name", NAME, "--publish", "127.0.0.1:55580:55555", image)
    check(started.returncode == 0, f"docker run failed: {started.stderr}")

    check_health(wait_healthy())
    print(f"health: ok, version {expected_version()}, {reply_table_entries()} table entries")

    status, headers, page = request("GET", "/")
    check(status == 200 and '<div id="app">' in page, "GET / did not serve the frontend")
    status, _, page = request("GET", "/r/ABC123")
    check(status == 200 and '<div id="app">' in page, "an /r/ invite link did not load the site")
    check_association(repo_well_known().APPLE_APP_SITE_ASSOCIATION)
    check_app_link_host()

    status, headers, first = request("GET", "/api/session")
    cookie = session_cookie(headers)
    check(status == 200 and cookie is not None, "GET /api/session set no session cookie")
    number = first["default_number"]
    check(first["created"] is True, "a first visit was not created")
    check(first["nickname"] == f"玩家 {number}", f"unexpected default nickname {first}")

    _, _, again = request("GET", "/api/session", cookie=cookie)
    check(again["created"] is False, "a known cookie was treated as new")

    status, _, thai = request(
        "PATCH", "/api/session", cookie=cookie, body={"locale": "th", "default_number": number}
    )
    check(status == 200, f"PATCH to Thai failed: {thai}")
    check(thai["nickname"] == f"ผู้เล่น {number}", f"Thai default nickname is {thai}")
    print(f"session: {first['nickname']} -> {thai['nickname']}")

    restarted = docker("restart", NAME)
    check(restarted.returncode == 0, f"docker restart failed: {restarted.stderr}")
    wait_healthy()
    _, headers, after = request("GET", "/api/session", cookie=cookie)
    renewed = session_cookie(headers)
    check(after["created"] is True, "the old cookie still worked after a restart")
    check(renewed is not None and renewed != cookie, "no new cookie after a restart")
    print("restart: old cookie answered with a new session")

    check_ai_move(renewed)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 tests/container_smoke.py IMAGE")
    docker("rm", "--force", NAME)
    try:
        run(sys.argv[1])
    except Exception as error:
        print(f"container smoke test failed: {error}", file=sys.stderr)
        print(f"last HTTP response: {last_response}", file=sys.stderr)
        logs = docker("logs", "--tail", "200", NAME)
        print(f"docker logs:\n{logs.stdout}{logs.stderr}", file=sys.stderr)
        raise SystemExit(1) from error
    finally:
        docker("rm", "--force", NAME)
    print("container smoke test passed")


if __name__ == "__main__":
    main()
