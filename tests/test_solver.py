import copy
import random

import pytest
from connect4_app import _solver
from connect4_app.domain import Game

CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6]
TABLE_MOVES = {9, 11, 13}


def centre_first(scores: list[int | None]) -> int:
    best: int | None = None
    for column in CENTRE_FIRST:
        score = scores[column]
        if score is not None and (best is None or score > scores[best]):  # type: ignore[operator]
            best = column
    assert best is not None
    return best


@pytest.mark.parametrize("history", ["4", "444333"])
def test_native_solver_always_selects_a_highest_scoring_move(history: str) -> None:
    scores = _solver.score_moves(history)
    selected = _solver.best_move(history)
    legal_scores = [score for score in scores if score is not None]
    assert scores[selected] == max(legal_scores)


@pytest.mark.parametrize("history", ["0", "8", "4444444", "x"])
def test_native_solver_rejects_invalid_history(history: str) -> None:
    with pytest.raises(ValueError):
        _solver.best_move(history)


def test_reply_table_is_embedded() -> None:
    assert _solver.reply_table_info() == (True, 52_721)


def hands_the_ai_a_win(game: Game, column: int) -> bool:
    after = copy.deepcopy(game)
    after.drop("green", column)
    if after.status != "playing":
        return False
    for reply in range(7):
        if after.board[0][reply] is None:
            trial = copy.deepcopy(after)
            trial.drop("pink", reply)
            if trial.winner == "pink":
                return True
    return False


def test_reply_table_matches_live_solving_in_ai_games() -> None:
    rng = random.Random(20260926)
    checked = {moves: 0 for moves in TABLE_MOVES}
    for _ in range(12):
        game = Game(room_id="r", mode="ai", seats={"green": "h", "pink": "ai"}, status="playing")
        while game.status == "playing":
            legal = [column for column in range(7) if game.board[0][column] is None]
            # A human who avoids handing the AI an immediate win keeps games long enough.
            safe = [column for column in legal if not hands_the_ai_a_win(game, column)]
            game.drop("green", rng.choice(safe or legal))
            if game.status != "playing":
                break
            history = game.history
            live = _solver.score_moves(history)
            if len(history) in TABLE_MOVES:
                assert _solver.reply_table_scores(history) == live, history
                checked[len(history)] += 1
            move = _solver.best_move(history)
            assert move == centre_first(live), history
            game.drop("pink", move)
    assert all(count >= 5 for count in checked.values()), checked


@pytest.mark.parametrize(
    "history",
    [
        "4444",  # the human is to move
        "123456712",  # the AI's earlier replies were not its own choices
        "744414544523255",  # 15 moves: beyond the table
    ],
)
def test_positions_outside_the_table_are_solved_live(history: str) -> None:
    assert _solver.reply_table_scores(history) is None
    assert _solver.best_move(history) == centre_first(_solver.score_moves(history))
