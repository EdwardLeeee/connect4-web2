import asyncio
import time
from typing import Any

import pytest
from connect4_app.domain import Game
from connect4_app.manager import CLOSE_REPLACED, GameManager
from connect4_app.sessions import SessionStore

FIRST_MOVER_WINS = [0, 1, 0, 1, 0, 1, 0]


class FakeSocket:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []
        self.closed = False
        self.close_code: int | None = None

    async def send_json(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    async def close(self, **kwargs: Any) -> None:
        self.closed = True
        self.close_code = kwargs.get("code")


class CentreSolver:
    def best_move(self, _history: str) -> int:
        return 3


def add_session(store: SessionStore, nickname: str) -> str:
    session, _ = store.resolve(None)
    session.nickname = nickname
    return session.id


async def matched_pair(
    reconnect_seconds: int = 30,
) -> tuple[GameManager, Game, dict[str, str], dict[str, FakeSocket]]:
    sessions = SessionStore()
    first = add_session(sessions, "Ada")
    second = add_session(sessions, "Lin")
    manager = GameManager(
        sessions,
        CentreSolver(),  # type: ignore[arg-type]
        reconnect_seconds=reconnect_seconds,
    )
    sockets = {first: FakeSocket(), second: FakeSocket()}
    for session_id, socket in sockets.items():
        await manager.connect(session_id, socket)  # type: ignore[arg-type]
    await manager.handle(first, {"type": "queue.join", "payload": {}})
    await manager.handle(second, {"type": "queue.join", "payload": {}})
    game = manager._game_for(first)
    assert game is not None
    return manager, game, dict(game.seats), sockets


async def play(manager: GameManager, game: Game, columns: list[int]) -> None:
    for column in columns:
        await manager.handle(
            game.seats[game.turn],
            {"type": "game.move", "payload": {"column": column}},
        )


def replay_history(history: str, first: str) -> list[list[str | None]]:
    second = "pink" if first == "green" else "green"
    board: list[list[str | None]] = [[None] * 7 for _ in range(6)]
    for index, digit in enumerate(history):
        column = int(digit) - 1
        row = max(row for row in range(6) if board[row][column] is None)
        board[row][column] = first if index % 2 == 0 else second
    return board


async def start_ai(
    reconnect_seconds: int = 30,
    ai_min_think_seconds: float = 0,
) -> tuple[GameManager, str, FakeSocket]:
    sessions = SessionStore()
    player = add_session(sessions, "Ada")
    manager = GameManager(
        sessions,
        CentreSolver(),  # type: ignore[arg-type]
        reconnect_seconds=reconnect_seconds,
        ai_min_think_seconds=ai_min_think_seconds,
    )
    socket = FakeSocket()
    await manager.connect(player, socket)  # type: ignore[arg-type]
    await manager.handle(player, {"type": "game.ai.start", "payload": {}})
    return manager, player, socket


@pytest.mark.asyncio
async def test_ai_move_is_computed_server_side(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_inline(function: Any, *args: Any) -> Any:
        return function(*args)

    monkeypatch.setattr(asyncio, "to_thread", run_inline)
    sessions = SessionStore()
    player = add_session(sessions, "Ada")
    manager = GameManager(
        sessions,
        CentreSolver(),  # type: ignore[arg-type]
        ai_min_think_seconds=0,
    )
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


@pytest.mark.asyncio
async def test_both_players_see_each_rematch_vote() -> None:
    manager, game, seats, _ = await matched_pair()
    await play(manager, game, FIRST_MOVER_WINS)
    await manager.handle(seats["pink"], {"type": "game.rematch", "payload": {}})

    green_view = manager.snapshot(seats["green"])["game"]
    pink_view = manager.snapshot(seats["pink"])["game"]
    assert green_view["rematch"] == {"green": False, "pink": True}
    assert green_view["rematch_requested"] is False
    assert pink_view["rematch_requested"] is True
    assert green_view["rematch_available"] is True


@pytest.mark.asyncio
async def test_rematch_is_unavailable_after_opponent_leaves_a_finished_game() -> None:
    manager, game, seats, sockets = await matched_pair()
    await play(manager, game, FIRST_MOVER_WINS)
    await manager.handle(seats["green"], {"type": "game.rematch", "payload": {}})
    revision = game.revision

    await manager.handle(seats["pink"], {"type": "game.leave", "payload": {}})
    view = manager.snapshot(seats["green"])["game"]
    assert view["result_reason"] == "connect_four"
    assert view["rematch_available"] is False
    assert view["rematch"] == {"green": False, "pink": False}
    assert game.revision > revision

    await manager.handle(seats["green"], {"type": "game.rematch", "payload": {}})
    assert sockets[seats["green"]].messages[-1] == {
        "type": "error",
        "payload": {"code": "rematch_unavailable"},
    }
    assert game.status == "finished"
    assert not game.rematch_votes


@pytest.mark.asyncio
async def test_leaving_mid_game_forfeits_once_without_rematch() -> None:
    manager, game, seats, _ = await matched_pair()
    await play(manager, game, [3])

    await manager.handle(seats["green"], {"type": "game.leave", "payload": {}})
    view = manager.snapshot(seats["pink"])["game"]
    assert view["winner"] == "pink"
    assert view["result_reason"] == "left"
    assert view["rematch_available"] is False
    assert view["series"] == {"you": 1, "opponent": 0, "draws": 0}


@pytest.mark.asyncio
async def test_disconnected_voter_cannot_be_pulled_into_a_new_game() -> None:
    manager, game, seats, sockets = await matched_pair(reconnect_seconds=1)
    await play(manager, game, FIRST_MOVER_WINS)
    await manager.handle(seats["pink"], {"type": "game.rematch", "payload": {}})
    await manager.disconnect(seats["pink"], sockets[seats["pink"]])  # type: ignore[arg-type]

    view = manager.snapshot(seats["green"])["game"]
    assert view["rematch"] == {"green": False, "pink": False}
    assert view["rematch_available"] is True
    assert view["players"]["pink"]["connected"] is False
    assert view["grace_deadline"] is None

    await manager.handle(seats["green"], {"type": "game.rematch", "payload": {}})
    assert game.status == "finished"
    assert game.seats == seats
    await asyncio.sleep(1.2)
    assert game.status == "finished"
    assert game.result_reason == "connect_four"
    assert manager._game_for(seats["green"]) is game

    await manager.connect(seats["pink"], FakeSocket())  # type: ignore[arg-type]
    await manager.handle(seats["pink"], {"type": "game.rematch", "payload": {}})
    assert game.status == "playing"
    assert game.seats == seats
    assert manager.snapshot(seats["green"])["game"]["first"] == "pink"


@pytest.mark.asyncio
async def test_grace_deadline_is_tracked_per_player() -> None:
    manager, game, seats, sockets = await matched_pair(reconnect_seconds=1)
    green, pink = seats["green"], seats["pink"]

    await manager.disconnect(pink, sockets[pink])  # type: ignore[arg-type]
    pink_deadline = manager.snapshot(green)["game"]["players"]["pink"]["grace_deadline"]
    assert pink_deadline is not None

    await manager.disconnect(green, sockets[green])  # type: ignore[arg-type]
    both_away = manager.snapshot(green)["game"]
    assert both_away["players"]["pink"]["grace_deadline"] == pink_deadline
    assert both_away["players"]["green"]["grace_deadline"] >= pink_deadline
    assert both_away["grace_deadline"] == pink_deadline

    await manager.connect(green, FakeSocket())  # type: ignore[arg-type]
    view = manager.snapshot(green)["game"]
    assert view["status"] == "paused"
    assert view["players"]["pink"]["grace_deadline"] == pink_deadline
    assert view["players"]["green"]["grace_deadline"] is None
    assert view["grace_deadline"] == pink_deadline

    await asyncio.sleep(1.2)
    view = manager.snapshot(green)["game"]
    assert view["status"] == "finished"
    assert view["result_reason"] == "forfeit"
    assert view["winner"] == "green"
    assert view["grace_deadline"] is None
    assert view["series"] == {"you": 1, "opponent": 0, "draws": 0}


@pytest.mark.asyncio
async def test_ai_game_survives_disconnect() -> None:
    manager, player, socket = await start_ai(reconnect_seconds=0)
    game = manager._game_for(player)
    assert game is not None

    await manager.disconnect(player, socket)  # type: ignore[arg-type]
    assert player not in manager.disconnect_tasks
    await asyncio.sleep(0.05)
    assert game.room_id in manager.rooms

    await manager.connect(player, FakeSocket())  # type: ignore[arg-type]
    view = manager.snapshot(player)["game"]
    assert view["status"] == "playing"
    assert view["grace_deadline"] is None
    assert view["players"]["green"]["grace_deadline"] is None
    assert view["players"]["pink"]["nickname"] == "Super AI"
    assert view["players"]["pink"]["is_ai"] is True


@pytest.mark.asyncio
async def test_ai_move_survives_reconnect_while_thinking(monkeypatch: pytest.MonkeyPatch) -> None:
    release = asyncio.Event()

    async def run_after_release(function: Any, *args: Any) -> Any:
        await release.wait()
        return function(*args)

    monkeypatch.setattr(asyncio, "to_thread", run_after_release)
    manager, player, socket = await start_ai()
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    game = manager._game_for(player)
    assert game is not None
    assert game.status == "thinking"

    await manager.disconnect(player, socket)  # type: ignore[arg-type]
    await manager.connect(player, FakeSocket())  # type: ignore[arg-type]
    release.set()
    await next(iter(manager.ai_tasks.values()))

    assert game.history == "34"
    assert game.status == "playing"


@pytest.mark.asyncio
async def test_snapshot_history_replays_to_board() -> None:
    manager, game, seats, _ = await matched_pair()
    await play(manager, game, [3, 3, 2, 4])

    view = manager.snapshot(seats["green"])["game"]
    assert view["first"] == "green"
    assert view["history"] == "4435"
    assert replay_history(view["history"], view["first"]) == view["board"]

    await play(manager, game, [1, 6, 0])
    assert game.winner == "green"
    for session_id in seats.values():
        await manager.handle(session_id, {"type": "game.rematch", "payload": {}})
    await play(manager, game, [6, 6, 5])

    view = manager.snapshot(seats["green"])["game"]
    assert view["first"] == "pink"
    assert view["history"] == "776"
    assert view["board"][5][6] == "pink"
    assert replay_history(view["history"], view["first"]) == view["board"]


@pytest.mark.asyncio
async def test_series_accumulates_across_rematches() -> None:
    manager, game, seats, _ = await matched_pair()
    await play(manager, game, FIRST_MOVER_WINS)
    for session_id in seats.values():
        await manager.handle(session_id, {"type": "game.rematch", "payload": {}})
    assert game.seats == seats
    assert game.status == "playing"
    assert game.first == "pink"
    assert game.turn == "pink"

    await play(manager, game, FIRST_MOVER_WINS)
    assert game.winner == "pink"
    assert manager.snapshot(seats["green"])["game"]["series"] == {
        "you": 1,
        "opponent": 1,
        "draws": 0,
    }


@pytest.mark.asyncio
async def test_snapshot_carries_server_time_outside_games() -> None:
    sessions = SessionStore()
    player = add_session(sessions, "Ada")
    manager = GameManager(sessions, CentreSolver())  # type: ignore[arg-type]

    before = time.time()
    snapshot = manager.snapshot(player)
    assert snapshot["game"] is None
    assert before <= snapshot["server_time"] <= time.time()


@pytest.mark.asyncio
async def test_newer_tab_replaces_older_without_withdrawing_vote() -> None:
    manager, game, seats, sockets = await matched_pair()
    await play(manager, game, FIRST_MOVER_WINS)
    pink = seats["pink"]
    await manager.handle(pink, {"type": "game.rematch", "payload": {}})

    old_socket = sockets[pink]
    await manager.connect(pink, FakeSocket())  # type: ignore[arg-type]
    await manager.disconnect(pink, old_socket)  # type: ignore[arg-type]

    assert old_socket.close_code == CLOSE_REPLACED == 4001
    assert pink in game.rematch_votes
    assert game.connected[pink] is True


@pytest.mark.asyncio
async def test_ai_rematch_after_solver_failure_restarts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(_function: Any, *_args: Any) -> Any:
        raise RuntimeError("solver offline")

    monkeypatch.setattr(asyncio, "to_thread", fail)
    manager, player, _ = await start_ai()
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    await next(iter(manager.ai_tasks.values()))
    view = manager.snapshot(player)["game"]
    assert view["status"] == "error"
    assert view["result_reason"] == "solver_unavailable"
    assert view["rematch_available"] is True

    await manager.handle(player, {"type": "game.rematch", "payload": {}})
    view = manager.snapshot(player)["game"]
    assert view["status"] == "playing"
    assert view["history"] == ""
    assert view["first"] == "green"


@pytest.mark.asyncio
async def test_ai_waits_for_the_minimum_think_time() -> None:
    manager, player, _ = await start_ai(ai_min_think_seconds=0.3)
    started = time.monotonic()
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    game = manager._game_for(player)
    assert game is not None

    await asyncio.sleep(0.1)
    assert game.status == "thinking"
    assert game.history == "3"

    await next(iter(manager.ai_tasks.values()))
    assert time.monotonic() - started >= 0.3
    assert game.history == "34"
    assert game.status == "playing"


@pytest.mark.asyncio
async def test_solver_failure_is_reported_without_waiting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail(_function: Any, *_args: Any) -> Any:
        raise RuntimeError("solver offline")

    monkeypatch.setattr(asyncio, "to_thread", fail)
    manager, player, _ = await start_ai(ai_min_think_seconds=5)
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    await asyncio.wait_for(next(iter(manager.ai_tasks.values())), timeout=1)

    view = manager.snapshot(player)["game"]
    assert view["status"] == "error"
    assert view["result_reason"] == "solver_unavailable"


@pytest.mark.asyncio
async def test_leaving_while_ai_thinks_cancels_the_move() -> None:
    manager, player, socket = await start_ai(ai_min_think_seconds=0.3)
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    task = next(iter(manager.ai_tasks.values()))

    await manager.handle(player, {"type": "game.leave", "payload": {}})
    await asyncio.gather(task, return_exceptions=True)

    assert task.cancelled()
    assert not manager.rooms
    assert manager.snapshot(player)["game"] is None
    assert all(message["type"] != "error" for message in socket.messages)


@pytest.mark.asyncio
async def test_ai_moves_after_player_disconnects_while_thinking() -> None:
    manager, player, socket = await start_ai(ai_min_think_seconds=0.2)
    await manager.handle(player, {"type": "game.move", "payload": {"column": 2}})
    game = manager._game_for(player)
    assert game is not None

    await manager.disconnect(player, socket)  # type: ignore[arg-type]
    await next(iter(manager.ai_tasks.values()))
    assert game.history == "34"
    assert game.status == "playing"

    replacement = FakeSocket()
    await manager.connect(player, replacement)  # type: ignore[arg-type]
    assert replacement.messages[-1]["payload"]["game"]["history"] == "34"
