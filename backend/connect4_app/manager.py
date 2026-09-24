from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections import deque
from contextlib import suppress
from typing import Any

from fastapi import WebSocket

from .domain import Color, Game, GameRuleError
from .sessions import SessionStore
from .solver import PerfectSolver

ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
RECONNECT_SECONDS = 30
AI_MIN_THINK_SECONDS = 1.0
AI_ID = "__perfect_ai__"
# The frontend stops reconnecting on this close code; do not renumber it.
CLOSE_REPLACED = 4001
logger = logging.getLogger(__name__)


class GameManager:
    def __init__(
        self,
        sessions: SessionStore | None = None,
        solver: PerfectSolver | None = None,
        *,
        reconnect_seconds: int = RECONNECT_SECONDS,
        ai_min_think_seconds: float = AI_MIN_THINK_SECONDS,
    ) -> None:
        self.sessions = sessions or SessionStore()
        self.solver = solver or PerfectSolver()
        self.reconnect_seconds = reconnect_seconds
        self.ai_min_think_seconds = ai_min_think_seconds
        self.rooms: dict[str, Game] = {}
        self.room_for: dict[str, str] = {}
        self.connections: dict[str, WebSocket] = {}
        self.queue: deque[str] = deque()
        self.disconnect_tasks: dict[str, asyncio.Task[None]] = {}
        self.ai_tasks: dict[str, asyncio.Task[None]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        previous: WebSocket | None
        async with self.lock:
            previous = self.connections.get(session_id)
            self.connections[session_id] = websocket
            task = self.disconnect_tasks.pop(session_id, None)
            if task:
                task.cancel()
            game = self._game_for(session_id)
            if game:
                game.connected[session_id] = True
                game.grace_deadlines.pop(session_id, None)
                if game.status == "paused" and self._all_humans_connected(game):
                    game.status = game.resume_status or "playing"
                    game.resume_status = None
                game.revision += 1
        if previous and previous is not websocket:
            with suppress(Exception):
                await previous.close(code=CLOSE_REPLACED, reason="Replaced by a newer connection")
        await self.send_snapshot(session_id)
        if game:
            await self.broadcast(game.room_id)

    async def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        room_id: str | None = None
        async with self.lock:
            if self.connections.get(session_id) is not websocket:
                return
            self.connections.pop(session_id, None)
            with suppress(ValueError):
                self.queue.remove(session_id)
            game = self._game_for(session_id)
            if not game:
                return
            room_id = game.room_id
            game.connected[session_id] = False
            # A disconnected player cannot consent to a new game.
            game.rematch_votes.discard(session_id)
            if game.status == "playing" and game.mode != "ai":
                game.resume_status = game.status
                game.status = "paused"
            game.revision += 1
            # AI games wait for their only human indefinitely; nobody else is kept waiting.
            if game.mode != "ai":
                game.grace_deadlines[session_id] = time.time() + self.reconnect_seconds
                task = asyncio.create_task(self._forfeit_after(session_id, game.room_id))
                self.disconnect_tasks[session_id] = task
        if room_id:
            await self.broadcast(room_id)

    async def handle(self, session_id: str, message: dict[str, Any]) -> None:
        message_type = message.get("type")
        payload = message.get("payload") or {}
        if not isinstance(message_type, str) or not isinstance(payload, dict):
            await self.send_error(session_id, "invalid_message")
            return

        handlers = {
            "game.ai.start": self._start_ai,
            "game.ai.retry": self._retry_ai,
            "room.create": self._create_private,
            "room.join": self._join_private,
            "queue.join": self._join_queue,
            "queue.leave": self._leave_queue,
            "game.move": self._move,
            "game.rematch": self._rematch,
            "game.leave": self._leave_game,
            "state.request": self._request_state,
        }
        handler = handlers.get(message_type)
        if handler is None:
            await self.send_error(session_id, "unknown_message")
            return
        try:
            await handler(session_id, payload)
        except GameRuleError as error:
            await self.send_error(session_id, error.code)
        except (KeyError, TypeError, ValueError):
            await self.send_error(session_id, "invalid_payload")

    async def _request_state(self, session_id: str, _payload: dict[str, Any]) -> None:
        await self.send_snapshot(session_id)

    async def _start_ai(self, session_id: str, _payload: dict[str, Any]) -> None:
        async with self.lock:
            self._require_available(session_id)
            game = self._new_game(
                mode="ai",
                seats={"green": session_id, "pink": AI_ID},
                status="playing",
            )
        await self.broadcast(game.room_id)

    async def _retry_ai(self, session_id: str, _payload: dict[str, Any]) -> None:
        async with self.lock:
            game = self._require_game(session_id)
            if game.mode != "ai" or game.status not in {"finished", "error"}:
                raise GameRuleError("rematch_unavailable")
            game.reset()
        await self.broadcast(game.room_id)

    async def _create_private(self, session_id: str, _payload: dict[str, Any]) -> None:
        async with self.lock:
            self._require_available(session_id)
            code = self._room_code()
            game = self._new_game(
                mode="private",
                seats={"green": session_id, "pink": ""},
                status="waiting",
                code=code,
            )
        await self.broadcast(game.room_id)

    async def _join_private(self, session_id: str, payload: dict[str, Any]) -> None:
        code = str(payload["code"]).strip().upper()
        async with self.lock:
            self._require_available(session_id)
            game = next((room for room in self.rooms.values() if room.code == code), None)
            if not game:
                raise GameRuleError("room_not_found")
            if game.status != "waiting" or game.seats["pink"]:
                raise GameRuleError("room_full")
            if not game.connected.get(game.seats["green"], False):
                raise GameRuleError("host_disconnected")
            game.seats["pink"] = session_id
            game.connected[session_id] = True
            game.status = "playing"
            game.revision += 1
            self.room_for[session_id] = game.room_id
        await self.broadcast(game.room_id)

    async def _join_queue(self, session_id: str, _payload: dict[str, Any]) -> None:
        game: Game | None = None
        async with self.lock:
            self._require_available(session_id)
            self._prune_queue()
            opponent = next((queued for queued in self.queue if queued != session_id), None)
            if opponent:
                self.queue.remove(opponent)
                if secrets.randbelow(2):
                    seats = {"green": session_id, "pink": opponent}
                else:
                    seats = {"green": opponent, "pink": session_id}
                game = self._new_game(mode="matchmaking", seats=seats, status="playing")
            elif session_id not in self.queue:
                self.queue.append(session_id)
        if game:
            await self.broadcast(game.room_id)
        else:
            await self.send_snapshot(session_id)

    async def _leave_queue(self, session_id: str, _payload: dict[str, Any]) -> None:
        async with self.lock:
            with suppress(ValueError):
                self.queue.remove(session_id)
        await self.send_snapshot(session_id)

    async def _move(self, session_id: str, payload: dict[str, Any]) -> None:
        schedule_ai: tuple[str, str] | None = None
        async with self.lock:
            game = self._require_game(session_id)
            color = game.color_for(session_id)
            if color is None:
                raise GameRuleError("not_a_player")
            game.drop(color, int(payload["column"]))
            if game.mode == "ai" and game.status == "playing" and game.turn == "pink":
                game.status = "thinking"
                game.revision += 1
                schedule_ai = (game.room_id, game.history)
        await self.broadcast(game.room_id)
        if schedule_ai:
            room_id, history = schedule_ai
            task = asyncio.create_task(self._run_ai(room_id, history))
            self.ai_tasks[room_id] = task

    async def _run_ai(self, room_id: str, history: str) -> None:
        # Guard on the position rather than the revision: reconnects bump the revision while
        # the AI thinks, and only this task can change the position until it finishes.
        loop = asyncio.get_running_loop()
        started = loop.time()
        try:
            column = await asyncio.to_thread(self.solver.best_move, history)
        except Exception:
            logger.exception("Perfect solver failed for room %s", room_id)
            async with self.lock:
                game = self.rooms.get(room_id)
                if game and game.history == history and game.status == "thinking":
                    game.status = "error"
                    game.result_reason = "solver_unavailable"
                    game.revision += 1
            await self.broadcast(room_id)
            return

        # Pacing only, so the AI does not answer instantly: the move is still the exact
        # solution, and solver failures above are reported without waiting.
        remaining = self.ai_min_think_seconds - (loop.time() - started)
        if remaining > 0:
            await asyncio.sleep(remaining)

        async with self.lock:
            game = self.rooms.get(room_id)
            if not game or game.history != history or game.status != "thinking":
                return
            game.drop("pink", column)
            if game.status == "thinking":
                game.status = "playing"
        await self.broadcast(room_id)

    async def _rematch(self, session_id: str, _payload: dict[str, Any]) -> None:
        async with self.lock:
            game = self._require_game(session_id)
            if not self._rematch_available(game):
                raise GameRuleError("rematch_unavailable")
            if game.mode == "ai":
                game.reset()
            else:
                game.rematch_votes.add(session_id)
                game.revision += 1
                if set(self._humans(game)) <= game.rematch_votes:
                    # Colours stay with their players; the previous second mover starts.
                    game.reset(alternate_first=True)
        await self.broadcast(game.room_id)

    async def _leave_game(self, session_id: str, _payload: dict[str, Any]) -> None:
        other_sessions: list[str] = []
        room_deleted = False
        async with self.lock:
            game = self._require_game(session_id)
            self.room_for.pop(session_id, None)
            game.connected.pop(session_id, None)
            if game.mode == "ai" or game.status == "waiting":
                self._delete_room(game)
                room_deleted = True
            else:
                if game.status not in {"finished", "error"}:
                    game.finish_by_forfeit(session_id)
                    game.result_reason = "left"
                game.rematch_votes.clear()
                game.revision += 1
                other_sessions = [
                    occupant
                    for occupant in game.seats.values()
                    if occupant and occupant not in {session_id, AI_ID}
                ]
                remaining = [
                    occupant
                    for occupant in other_sessions
                    if self.room_for.get(occupant) == game.room_id
                ]
                if not remaining:
                    self._delete_room(game)
                    room_deleted = True
        await self.send_snapshot(session_id)
        if not room_deleted:
            await self.broadcast(game.room_id)
        for other in other_sessions:
            await self.send_snapshot(other)

    async def _forfeit_after(self, session_id: str, room_id: str) -> None:
        try:
            await asyncio.sleep(self.reconnect_seconds)
            async with self.lock:
                if session_id in self.connections:
                    return
                game = self.rooms.get(room_id)
                if not game or game.color_for(session_id) is None:
                    return
                if game.status == "waiting":
                    self._delete_room(game)
                    return
                if game.status in {"finished", "error"}:
                    if not self._all_humans_connected(game):
                        connected_human = any(
                            game.connected.get(occupant, False)
                            for occupant in game.seats.values()
                            if occupant
                        )
                        if not connected_human:
                            self._delete_room(game)
                    return
                game.finish_by_forfeit(session_id)
            await self.broadcast(room_id)
        finally:
            # A reconnect replaces this entry; only clear state this task still owns.
            if self.disconnect_tasks.get(session_id) is asyncio.current_task():
                self.disconnect_tasks.pop(session_id, None)
                game = self.rooms.get(room_id)
                if game:
                    game.grace_deadlines.pop(session_id, None)

    async def send_snapshot(self, session_id: str) -> None:
        websocket = self.connections.get(session_id)
        if not websocket:
            return
        payload = self.snapshot(session_id)
        try:
            await websocket.send_json({"type": "state.snapshot", "payload": payload})
        except Exception:
            pass

    async def broadcast(self, room_id: str) -> None:
        game = self.rooms.get(room_id)
        if not game:
            return
        await asyncio.gather(*(self.send_snapshot(session_id) for session_id in self._humans(game)))

    async def send_error(self, session_id: str, code: str) -> None:
        websocket = self.connections.get(session_id)
        if websocket:
            with suppress(Exception):
                await websocket.send_json({"type": "error", "payload": {"code": code}})

    def snapshot(self, session_id: str) -> dict[str, Any]:
        session = self.sessions.sessions[session_id]
        game = self._game_for(session_id)
        base: dict[str, Any] = {
            "server_time": time.time(),
            "session": {
                "nickname": session.nickname,
                "locale": session.locale,
            },
            "queue": {"searching": session_id in self.queue},
            "room": None,
            "game": None,
        }
        if not game:
            return base

        color = game.color_for(session_id)
        players: dict[str, dict[str, Any]] = {}
        for seat_color, occupant in game.seats.items():
            if occupant == AI_ID:
                players[seat_color] = {
                    "nickname": "Super AI",
                    "connected": True,
                    "is_ai": True,
                    "grace_deadline": None,
                }
            elif occupant:
                player = self.sessions.sessions.get(occupant)
                connected = game.connected.get(occupant, False)
                players[seat_color] = {
                    "nickname": player.nickname if player else "Player",
                    "connected": connected,
                    "is_ai": False,
                    "grace_deadline": (
                        game.grace_deadlines.get(occupant)
                        if game.status == "paused" and not connected
                        else None
                    ),
                }
        deadlines = [
            player["grace_deadline"]
            for player in players.values()
            if player["grace_deadline"] is not None
        ]
        opponent = next(
            (occupant for occupant in game.seats.values() if occupant and occupant != session_id),
            None,
        )

        base["room"] = {
            "id": game.room_id,
            "code": game.code,
            "mode": game.mode,
        }
        base["game"] = {
            "revision": game.revision,
            "status": game.status,
            "board": game.board,
            "history": game.history,
            "first": game.first,
            "turn": game.turn,
            "you": color,
            "winner": game.winner,
            "winning_cells": game.win_cells,
            "result_reason": game.result_reason,
            "players": players,
            "rematch": {
                seat_color: bool(occupant) and occupant in game.rematch_votes
                for seat_color, occupant in game.seats.items()
            },
            "rematch_requested": session_id in game.rematch_votes,
            "rematch_available": self._rematch_available(game),
            "series": {
                "you": game.scores.get(session_id, 0),
                "opponent": game.scores.get(opponent, 0) if opponent else 0,
                "draws": game.draws,
            },
            "grace_deadline": min(deadlines, default=None),
        }
        return base

    def _new_game(
        self,
        *,
        mode: str,
        seats: dict[Color, str],
        status: str,
        code: str | None = None,
    ) -> Game:
        room_id = secrets.token_urlsafe(10)
        game = Game(
            room_id=room_id,
            mode=mode,  # type: ignore[arg-type]
            seats=seats,
            status=status,  # type: ignore[arg-type]
            code=code,
        )
        for occupant in seats.values():
            if occupant and occupant != AI_ID:
                self.room_for[occupant] = room_id
                game.connected[occupant] = occupant in self.connections
        self.rooms[room_id] = game
        return game

    def _delete_room(self, game: Game) -> None:
        self.rooms.pop(game.room_id, None)
        for occupant in game.seats.values():
            if occupant and occupant != AI_ID and self.room_for.get(occupant) == game.room_id:
                self.room_for.pop(occupant, None)
        task = self.ai_tasks.pop(game.room_id, None)
        if task:
            task.cancel()

    def _game_for(self, session_id: str) -> Game | None:
        room_id = self.room_for.get(session_id)
        return self.rooms.get(room_id or "")

    def _require_game(self, session_id: str) -> Game:
        game = self._game_for(session_id)
        if not game:
            raise GameRuleError("not_in_game")
        return game

    def _require_available(self, session_id: str) -> None:
        if self._game_for(session_id):
            raise GameRuleError("already_in_game")
        if session_id in self.queue:
            raise GameRuleError("already_searching")

    def _humans(self, game: Game) -> list[str]:
        return [occupant for occupant in game.seats.values() if occupant and occupant != AI_ID]

    def _all_humans_connected(self, game: Game) -> bool:
        return all(game.connected.get(occupant, False) for occupant in self._humans(game))

    def _rematch_available(self, game: Game) -> bool:
        if game.mode == "ai":
            return game.status in {"finished", "error"}
        # Membership, not result_reason: a player who left after a normal finish leaves
        # result_reason untouched, while a merely disconnected player may still return.
        return game.status == "finished" and all(
            self.room_for.get(occupant) == game.room_id for occupant in self._humans(game)
        )

    def _prune_queue(self) -> None:
        self.queue = deque(
            session_id
            for session_id in self.queue
            if session_id in self.connections and not self._game_for(session_id)
        )

    def _room_code(self) -> str:
        existing = {room.code for room in self.rooms.values() if room.code}
        while True:
            code = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(6))
            if code not in existing:
                return code
