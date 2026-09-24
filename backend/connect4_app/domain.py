from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ROWS = 6
COLUMNS = 7

Color = Literal["green", "pink"]
Mode = Literal["ai", "private", "matchmaking"]
Status = Literal["waiting", "playing", "thinking", "paused", "finished", "error"]
Cell = Color | None


class GameRuleError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def empty_board() -> list[list[Cell]]:
    return [[None for _ in range(COLUMNS)] for _ in range(ROWS)]


def winning_cells(board: list[list[Cell]], color: Color) -> list[dict[str, int]]:
    directions = ((0, 1), (1, 0), (1, 1), (1, -1))
    for row in range(ROWS):
        for column in range(COLUMNS):
            for delta_row, delta_column in directions:
                cells: list[dict[str, int]] = []
                for offset in range(4):
                    target_row = row + delta_row * offset
                    target_column = column + delta_column * offset
                    if not (0 <= target_row < ROWS and 0 <= target_column < COLUMNS):
                        break
                    if board[target_row][target_column] != color:
                        break
                    cells.append({"row": target_row, "column": target_column})
                if len(cells) == 4:
                    return cells
    return []


@dataclass
class Game:
    room_id: str
    mode: Mode
    seats: dict[Color, str]
    status: Status
    code: str | None = None
    board: list[list[Cell]] = field(default_factory=empty_board)
    history: str = ""
    turn: Color = "green"
    winner: Color | None = None
    win_cells: list[dict[str, int]] = field(default_factory=list)
    result_reason: str | None = None
    revision: int = 1
    rematch_votes: set[str] = field(default_factory=set)
    connected: dict[str, bool] = field(default_factory=dict)
    resume_status: Status | None = None
    first: Color = "green"
    grace_deadlines: dict[str, float] = field(default_factory=dict)
    scores: dict[str, int] = field(default_factory=dict)
    draws: int = 0

    def color_for(self, session_id: str) -> Color | None:
        for color, occupant in self.seats.items():
            if occupant == session_id:
                return color
        return None

    def drop(self, color: Color, column: int) -> int:
        allowed = self.status == "playing" or (
            self.status == "thinking" and self.mode == "ai" and color == "pink"
        )
        if not allowed:
            raise GameRuleError("game_not_playable")
        if color != self.turn:
            raise GameRuleError("not_your_turn")
        if not 0 <= column < COLUMNS:
            raise GameRuleError("invalid_column")

        row = next(
            (
                candidate
                for candidate in range(ROWS - 1, -1, -1)
                if self.board[candidate][column] is None
            ),
            None,
        )
        if row is None:
            raise GameRuleError("column_full")

        self.board[row][column] = color
        self.history += str(column + 1)
        self.revision += 1
        self.rematch_votes.clear()
        cells = winning_cells(self.board, color)
        if cells:
            self.status = "finished"
            self.winner = color
            self.win_cells = cells
            self.result_reason = "connect_four"
            self._score(color)
        elif len(self.history) == ROWS * COLUMNS:
            self.status = "finished"
            self.winner = None
            self.result_reason = "draw"
            self.draws += 1
        else:
            self.turn = "pink" if color == "green" else "green"
        return row

    def reset(self, *, alternate_first: bool = False) -> None:
        if alternate_first:
            self.first = "pink" if self.first == "green" else "green"
        self.board = empty_board()
        self.history = ""
        self.turn = self.first
        self.status = "playing"
        self.winner = None
        self.win_cells = []
        self.result_reason = None
        self.rematch_votes.clear()
        self.resume_status = None
        self.revision += 1

    def finish_by_forfeit(self, disconnected_session: str) -> None:
        disconnected_color = self.color_for(disconnected_session)
        if disconnected_color is None or self.status == "finished":
            return
        winner: Color = "pink" if disconnected_color == "green" else "green"
        self.status = "finished"
        self.winner = winner
        self.result_reason = "forfeit"
        self.resume_status = None
        self._score(winner)
        self.revision += 1

    def _score(self, color: Color) -> None:
        occupant = self.seats[color]
        self.scores[occupant] = self.scores.get(occupant, 0) + 1
