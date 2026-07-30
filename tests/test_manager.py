import asyncio
from typing import Any

import pytest
from connect4_app.manager import GameManager
from connect4_app.sessions import SessionStore


class FakeSocket:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []
        self.closed = False

    async def send_json(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    async def close(self, **_kwargs: Any) -> None:
        self.closed = True


class CentreSolver:
    def best_move(self, _history: str) -> int:
        return 3


def add_session(store: SessionStore, nickname: str) -> str:
    session, _ = store.resolve(None)
    session.nickname = nickname
    return session.id


@pytest.mark.asyncio
async def test_ai_move_is_computed_server_side(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_inline(function: Any, *args: Any) -> Any:
        return function(*args)

    monkeypatch.setattr(asyncio, "to_thread", run_inline)
    sessions = SessionStore()
    player = add_session(sessions, "Ada")
    manager = GameManager(sessions, CentreSolver())  # type: ignore[arg-type]
    socket = FakeSocket()
    await manager.connect(player, socket)  # type: ignore[arg-type]

    await manager.handle(player, {"type": "game.ai.start", "payload": {}})
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    task = next(iter(manager.ai_tasks.values()))
    await task

    game = manager._game_for(player)
    assert game is not None
    assert game.history == "34"
    assert game.board[5][2] == "green"
    assert game.board[5][3] == "pink"
    assert game.turn == "green"
    assert game.status == "playing"


@pytest.mark.asyncio
async def test_matchmaking_assigns_roles_and_rejects_impersonation() -> None:
    sessions = SessionStore()
    first = add_session(sessions, "Ada")
    second = add_session(sessions, "Lin")
    manager = GameManager(sessions, CentreSolver())  # type: ignore[arg-type]
    first_socket, second_socket = FakeSocket(), FakeSocket()
    await manager.connect(first, first_socket)  # type: ignore[arg-type]
    await manager.connect(second, second_socket)  # type: ignore[arg-type]
    await manager.handle(first, {"type": "queue.join", "payload": {}})
    await manager.handle(second, {"type": "queue.join", "payload": {}})

    game = manager._game_for(first)
    assert game is manager._game_for(second)
    assert game is not None
    pink_session = game.seats["pink"]
    pink_socket = first_socket if pink_session == first else second_socket
    await manager.handle(pink_session, {"type": "game.move", "payload": {"column": 3}})
    assert pink_socket.messages[-1] == {
        "type": "error",
        "payload": {"code": "not_your_turn"},
    }


@pytest.mark.asyncio
async def test_reconnect_before_grace_period_preserves_game() -> None:
    sessions = SessionStore()
    first = add_session(sessions, "Ada")
    second = add_session(sessions, "Lin")
    manager = GameManager(sessions, CentreSolver(), reconnect_seconds=1)  # type: ignore[arg-type]
    first_socket, second_socket = FakeSocket(), FakeSocket()
    await manager.connect(first, first_socket)  # type: ignore[arg-type]
    await manager.connect(second, second_socket)  # type: ignore[arg-type]
    await manager.handle(first, {"type": "queue.join", "payload": {}})
    await manager.handle(second, {"type": "queue.join", "payload": {}})

    await manager.disconnect(first, first_socket)  # type: ignore[arg-type]
    assert manager._game_for(first).status == "paused"  # type: ignore[union-attr]
    replacement = FakeSocket()
    await manager.connect(first, replacement)  # type: ignore[arg-type]
    await asyncio.sleep(0)
    assert manager._game_for(first).status == "playing"  # type: ignore[union-attr]
