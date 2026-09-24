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


def test_rematch_keeps_human_colors() -> None:
    game = make_game()
    game.status = "finished"
    game.winner = "green"
    game.reset()
    assert game.seats == {"green": "green-session", "pink": "pink-session"}
    assert game.board == empty_board()
    assert game.first == "green"
    assert game.turn == "green"


def test_rematch_can_alternate_first_mover() -> None:
    game = make_game()
    game.reset(alternate_first=True)
    assert game.seats == {"green": "green-session", "pink": "pink-session"}
    assert game.first == "pink"
    assert game.turn == "pink"
    with pytest.raises(GameRuleError, match="not_your_turn"):
        game.drop("green", 3)
    game.drop("pink", 3)
    assert game.board[5][3] == "pink"

    game.reset(alternate_first=True)
    assert game.first == "green"
    assert game.turn == "green"


DRAW = [1, 3, 1, 1, 1, 1, 1, 3, 5, 2, 3, 0, 4, 3, 2, 5, 5, 2, 6, 0, 6]
DRAW += [4, 0, 0, 0, 4, 2, 6, 3, 0, 5, 4, 2, 2, 4, 4, 6, 5, 5, 6, 6, 3]


def test_series_counts_draws_and_wins_across_rematches() -> None:
    game = make_game()
    for column in DRAW:
        game.drop(game.turn, column)
    assert game.result_reason == "draw"
    assert game.draws == 1
    assert game.scores == {}

    game.reset()
    for column in [0, 1, 0, 1, 0, 1, 0]:
        game.drop(game.turn, column)
    assert game.scores == {"green-session": 1}
    assert game.draws == 1


def test_forfeit_scores_the_winner_once() -> None:
    game = make_game()
    game.finish_by_forfeit("green-session")
    revision = game.revision
    game.finish_by_forfeit("green-session")
    assert game.winner == "pink"
    assert game.scores == {"pink-session": 1}
    assert game.revision == revision
