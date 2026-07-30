import pytest
from connect4_app import _solver


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
