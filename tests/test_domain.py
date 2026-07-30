import pytest
from connect4_app.domain import Game, GameRuleError, empty_board, winning_cells


def make_game() -> Game:
    return Game(
        room_id="room",
        mode="private",
        seats={"green": "green-session", "pink": "pink-session"},
        status="playing",
    )


@pytest.mark.parametrize(
    ("moves", "expected"),
    [
        ([0, 0, 1, 1, 2, 2, 3], "green"),
        ([0, 1, 0, 1, 0, 1, 0], "green"),
        ([0, 1, 1, 2, 5, 2, 2, 3, 5, 3, 6, 3, 3], "green"),
    ],
)
def test_detects_all_win_directions(moves: list[int], expected: str) -> None:
    game = make_game()
    for column in moves:
        game.drop(game.turn, column)
    assert game.winner == expected
    assert game.status == "finished"
    assert len(game.win_cells) == 4


def test_rejects_wrong_turn_and_full_column() -> None:
    game = make_game()
    with pytest.raises(GameRuleError, match="not_your_turn"):
        game.drop("pink", 0)

    for _ in range(6):
        game.drop(game.turn, 0)
    with pytest.raises(GameRuleError, match="column_full"):
        game.drop(game.turn, 0)


def test_winning_cells_ignores_empty_board() -> None:
    assert winning_cells(empty_board(), "green") == []


def test_rematch_swaps_human_colors() -> None:
    game = make_game()
    game.status = "finished"
    game.winner = "green"
    game.reset(swap=True)
    assert game.seats == {"green": "pink-session", "pink": "green-session"}
    assert game.board == empty_board()
    assert game.turn == "green"
