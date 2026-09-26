"""Fixtures that pin the app's on-device AI (frontend/src/local) to the server.

The server is the source of truth: these are recorded from domain.py, manager.py and the
native solver, and frontend/tests/local replays them. tests/test_local_parity.py fails
when a recording no longer matches the committed file; regenerate with

    .venv/bin/python tests/local_parity.py
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import random
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from connect4_app import _solver  # noqa: E402
from connect4_app.domain import Game, GameRuleError  # noqa: E402
from connect4_app.manager import GameManager  # noqa: E402
from connect4_app.sessions import SessionStore  # noqa: E402
from connect4_app.solver import PerfectSolver  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "frontend" / "tests" / "local" / "fixtures"
CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6]
HUMAN, AI = "human", "ai"


def centre_first(scores: list[int | None]) -> int:
    best: int | None = None
    for column in CENTRE_FIRST:
        score = scores[column]
        if score is not None and (best is None or score > scores[best]):  # type: ignore[operator]
            best = column
    assert best is not None
    return best


def compact_board(board: list[list[str | None]]) -> list[str]:
    """Rows top to bottom, one character per cell: g(reen), p(ink) or '.'."""
    return ["".join({"green": "g", "pink": "p", None: "."}[cell] for cell in row) for row in board]


def game_state(game: Game) -> dict[str, Any]:
    return {
        "board": compact_board(game.board),
        "history": game.history,
        "turn": game.turn,
        "status": game.status,
        "winner": game.winner,
        "winning_cells": game.win_cells,
        "result_reason": game.result_reason,
        "revision": game.revision,
        "series": {
            "you": game.scores.get(HUMAN, 0),
            "opponent": game.scores.get(AI, 0),
            "draws": game.draws,
        },
    }


# A full-board draw (tests/test_domain.py DRAW).
DRAW = [1, 3, 1, 1, 1, 1, 1, 3, 5, 2, 3, 0, 4, 3, 2, 5, 5, 2, 6, 0, 6]
DRAW += [4, 0, 0, 0, 4, 2, 6, 3, 0, 5, 4, 2, 2, 4, 4, 6, 5, 5, 6, 6, 3]


def rules_fixture() -> list[dict[str, Any]]:
    """Move sequences on domain.Game with every step's state or error code."""
    rng = random.Random(20260926)
    scripts: list[list[dict[str, Any]]] = []
    scripts.append(
        [{"color": "green" if i % 2 == 0 else "pink", "column": c} for i, c in enumerate(DRAW)]
    )
    for _ in range(24):
        steps: list[dict[str, Any]] = []
        turn = "green"
        for _ in range(rng.randint(10, 48)):
            roll = rng.random()
            if roll < 0.04:
                steps.append({"reset": True})
                turn = "green"
                continue
            color = turn if roll > 0.1 else ("pink" if turn == "green" else "green")
            column = rng.choice([-1, 7]) if rng.random() < 0.05 else rng.randrange(7)
            steps.append({"color": color, "column": column})
            turn = "pink" if turn == "green" else "green"
        scripts.append(steps)

    fixtures = []
    for steps in scripts:
        game = Game(room_id="r", mode="ai", seats={"green": HUMAN, "pink": AI}, status="playing")
        results = []
        for step in steps:
            if step.get("reset"):
                if game.status == "finished":
                    game.reset()
                    results.append({"state": copy.deepcopy(game_state(game))})
                else:
                    results.append({"skipped": True})
                continue
            try:
                game.drop(step["color"], step["column"])
            except GameRuleError as error:
                results.append({"error": error.code})
                continue
            results.append({"state": copy.deepcopy(game_state(game))})
        fixtures.append({"steps": steps, "results": results})
    return fixtures


class RecordingSocket:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send_json(self, message: dict[str, Any]) -> None:
        # A real socket serialises on send; the snapshot's board is the live game board.
        self.messages.append(copy.deepcopy(message))

    async def close(self, **_kwargs: Any) -> None:
        pass


class FailingSolver:
    def best_move(self, _history: str) -> int:
        raise RuntimeError("solver offline")


def normalise(message: dict[str, Any]) -> dict[str, Any]:
    """Drops what legitimately differs: the clock and the room id."""
    message = copy.deepcopy(message)
    payload = message["payload"]
    if message["type"] == "state.snapshot":
        payload.pop("server_time")
        if payload["room"]:
            payload["room"]["id"] = "<room>"
    return message


PROTOCOL_SCRIPTS: dict[str, list[dict[str, Any]]] = {
    "errors before and around a game": [
        {"type": "game.move", "payload": {"column": 3}},
        {"type": "game.ai.retry", "payload": {}},
        {"type": "game.ai.start", "payload": {}},
        {"type": "game.ai.start", "payload": {}},
        {"type": "game.ai.retry", "payload": {}},
        {"type": "game.move", "payload": {}},
        {"type": "game.move", "payload": {"column": "x"}},
        {"type": "game.move", "payload": {"column": 9}},
        {"type": "game.move", "payload": {"column": "3"}},
        {"type": "no.such.message", "payload": {}},
        {"type": "state.request", "payload": {}},
        {"type": "game.leave", "payload": {}},
        {"type": "game.leave", "payload": {}},
    ],
    "a lost game, a rematch and a retry": [
        {"type": "game.ai.start", "payload": {}},
        *[
            {"type": "game.move", "payload": {"column": c}}
            for c in [6, 3, 0, 4, 3, 1, 1, 4, 0, 0, 5]
        ],
        {"type": "game.rematch", "payload": {}},
        {"type": "game.move", "payload": {"column": 0}},
        {"type": "game.move", "payload": {"column": 0}},
        {"type": "game.move", "payload": {"column": 0}},
        {"type": "game.move", "payload": {"column": 0}},
        {"type": "game.ai.retry", "payload": {}},
        {"type": "game.leave", "payload": {}},
    ],
}


async def record(script: list[dict[str, Any]], solver: Any) -> list[list[dict[str, Any]]]:
    # The failing-engine script logs the expected solver exception; keep the output quiet.
    logging.getLogger("connect4_app.manager").setLevel(logging.CRITICAL)
    sessions = SessionStore()
    session, _ = sessions.resolve(None)
    sessions.update(session, "Ada", "zh-TW", None)
    manager = GameManager(sessions, solver, ai_min_think_seconds=0)
    socket = RecordingSocket()
    await manager.connect(session.id, socket)  # type: ignore[arg-type]
    socket.messages.clear()
    replies = []
    for action in script:
        await manager.handle(session.id, action)
        for task in list(manager.ai_tasks.values()):
            await task
        manager.ai_tasks.clear()
        replies.append([normalise(message) for message in socket.messages])
        socket.messages.clear()
    return replies


def protocol_fixture() -> list[dict[str, Any]]:
    fixtures = []
    for name, script in PROTOCOL_SCRIPTS.items():
        replies = asyncio.run(record(script, PerfectSolver()))
        fixtures.append({"name": name, "engine": "exact", "script": script, "replies": replies})
    failing = [
        {"type": "game.ai.start", "payload": {}},
        {"type": "game.move", "payload": {"column": 3}},
        {"type": "game.move", "payload": {"column": 3}},
        {"type": "game.ai.retry", "payload": {}},
        {"type": "game.leave", "payload": {}},
    ]
    fixtures.append(
        {
            "name": "the engine fails",
            "engine": "failing",
            "script": failing,
            "replies": asyncio.run(record(failing, FailingSolver())),
        }
    )
    return fixtures


def ai_fixture() -> list[dict[str, Any]]:
    """Positions with the server's exact scores and column, from AI games and at random."""
    rng = random.Random(20260927)
    histories: list[str] = []
    for _ in range(24):
        game = Game(room_id="r", mode="ai", seats={"green": HUMAN, "pink": AI}, status="playing")
        while game.status == "playing":
            legal = [column for column in range(7) if game.board[0][column] is None]
            game.drop("green", rng.choice(legal))
            if game.status != "playing":
                break
            histories.append(game.history)
            game.drop("pink", _solver.best_move(game.history))
    for length in (14, 15, 16, 18, 20):
        for _ in range(12):
            game = Game(
                room_id="r", mode="ai", seats={"green": HUMAN, "pink": AI}, status="playing"
            )
            while game.status == "playing" and len(game.history) < length:
                legal = [column for column in range(7) if game.board[0][column] is None]
                game.drop(game.turn, rng.choice(legal))
            if game.status == "playing":
                histories.append(game.history)

    fixtures = []
    for history in dict.fromkeys(histories):
        table = _solver.reply_table_scores(history)
        scores = table if table is not None else _solver.score_moves(history)
        column = _solver.best_move(history)
        assert column == centre_first(scores), history
        fixtures.append(
            {"history": history, "scores": scores, "column": column, "in_table": table is not None}
        )
    return fixtures


def build() -> dict[str, Any]:
    return {
        "rules-parity.json": rules_fixture(),
        "protocol-parity.json": protocol_fixture(),
        "ai-parity.json": ai_fixture(),
    }


def encode(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


if __name__ == "__main__":
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, data in build().items():
        (FIXTURES / name).write_text(encode(data), encoding="utf-8")
        print(f"wrote {FIXTURES / name}")
