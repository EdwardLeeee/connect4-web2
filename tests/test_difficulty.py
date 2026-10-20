from collections import Counter

import pytest
from connect4_app.difficulty import (
    EASY_RANDOM_IS_SAFE,
    EASY_RANDOM_PERCENT,
    MISTAKE_OR_BEST,
    NORMAL_MISTAKE_DEPTH,
    NORMAL_MISTAKE_PERCENT,
    NORMAL_OPENING_STONES,
    RANDOM_OR_BEST,
    draw,
    forces_win,
    hands_over_win,
    mistake_columns,
    mix,
    planned_move,
    stones,
)

SEEDS = range(1000)
# The first mover has three in column 1, the second mover three in column 2.
BOTH_THREATEN = "121212"
# The first mover has three in column 1 and the second mover must block it.
MUST_BLOCK = "12121"
# Quiet for both sides, but the second mover's stone in column 5 would let the first mover
# connect row 2 from column 3 to column 6.
COLUMN_5_HANDS_OVER = "4337466"
# Thirteen stones; the mover can connect four in column 7, the opponent in column 2.
LATE_BOTH_THREATEN = "3265252736442"
# Thirteen stones; the opponent threatens column 3, so every other column hands over a win.
LATE_MUST_BLOCK = "1224317537341"
# Fifteen stones, quiet: columns 2 and 6 let the opponent force a win with its second move,
# column 5 hands it a win at once.
LATE_MISTAKES = "353633352113444"
# Twelve stones, quiet, and no column lets the opponent force a win within two moves.
LATE_NO_MISTAKE = "221321136442"
# Fourteen stones, quiet: after column 3 the opponent could make two threats, but the mover
# would then connect four itself, so column 3 is no mistake.
OWN_WIN_REFUTES = "66632324261442"


def test_mix_is_splitmix64() -> None:
    # The first output of the reference SplitMix64 generator seeded with 0.
    assert mix(0) == 0xE220A8397B1DCDAF


def test_draws_depend_only_on_seed_history_and_salt() -> None:
    assert draw(7, "44", 1) == draw(7, "44", 1)
    values = {draw(8, "44", 1), draw(7, "43", 1), *(draw(7, "44", salt) for salt in range(1, 5))}
    assert len(values) == 6
    assert draw(2**64 + 7, "44", 1) == draw(7, "44", 1)


@pytest.mark.parametrize("history", ["", "4", BOTH_THREATEN, LATE_MISTAKES, LATE_MUST_BLOCK])
def test_super_always_plays_the_best_move(history: str) -> None:
    assert all(planned_move("super", seed, history) is None for seed in SEEDS)


def test_easy_plays_at_random_on_its_share_of_moves() -> None:
    picks = Counter(planned_move("easy", seed, COLUMN_5_HANDS_OVER) for seed in SEEDS)
    assert abs(1 - picks[None] / len(SEEDS) - EASY_RANDOM_PERCENT / 100) < 0.05
    # Only a safe level avoids column 5, which would hand the first mover a win.
    assert set(picks) - {None} == set(range(7)) - ({4} if EASY_RANDOM_IS_SAFE else set())


def test_easys_random_or_best_is_decided_by_its_first_draw() -> None:
    for seed in SEEDS:
        random_move = draw(seed, "4", RANDOM_OR_BEST) % 100 < EASY_RANDOM_PERCENT
        assert (planned_move("easy", seed, "4") is not None) is random_move


@pytest.mark.parametrize(
    ("difficulty", "history", "column"),
    [
        ("easy", BOTH_THREATEN, 0),
        ("easy", MUST_BLOCK, 0),
        ("normal", LATE_BOTH_THREATEN, 6),
        ("normal", LATE_MUST_BLOCK, 2),
    ],
)
def test_each_level_takes_its_win_and_then_blocks(
    difficulty: str, history: str, column: int
) -> None:
    assert {planned_move(difficulty, seed, history) for seed in SEEDS} == {column}  # type: ignore[arg-type]


@pytest.mark.parametrize("history", ["", "4", BOTH_THREATEN, "44444455555"])
def test_normal_plays_the_best_move_through_the_opening(history: str) -> None:
    assert len(history) < NORMAL_OPENING_STONES
    assert all(planned_move("normal", seed, history) is None for seed in SEEDS)


def test_normals_opening_ends_at_twelve_stones() -> None:
    # Quiet positions with a mistake column: eleven stones still play the best move, twelve
    # may already make the mistake.
    eleven, twelve = "41355523654", "536514336675"
    assert NORMAL_OPENING_STONES == len(twelve) == len(eleven) + 1
    assert mistake_columns(stones(eleven), 1, NORMAL_MISTAKE_DEPTH) == [2]
    assert all(planned_move("normal", seed, eleven) is None for seed in SEEDS)
    assert mistake_columns(stones(twelve), 0, NORMAL_MISTAKE_DEPTH) == [0, 1, 2, 4, 6]
    assert {planned_move("normal", seed, twelve) for seed in SEEDS} == {None, 0, 1, 2, 4, 6}


def test_normal_makes_a_mistake_on_its_share_of_moves() -> None:
    assert len(LATE_MISTAKES) >= NORMAL_OPENING_STONES
    assert mistake_columns(stones(LATE_MISTAKES), 1, NORMAL_MISTAKE_DEPTH) == [1, 5]
    picks = Counter(planned_move("normal", seed, LATE_MISTAKES) for seed in SEEDS)
    assert set(picks) == {None, 1, 5}
    assert abs(1 - picks[None] / len(SEEDS) - NORMAL_MISTAKE_PERCENT / 100) < 0.05
    for seed in SEEDS:
        mistake = draw(seed, LATE_MISTAKES, MISTAKE_OR_BEST) % 100 < NORMAL_MISTAKE_PERCENT
        assert (planned_move("normal", seed, LATE_MISTAKES) is not None) is mistake


def test_a_mistake_never_hands_over_a_win_at_once() -> None:
    stacks = stones(LATE_MISTAKES)
    assert hands_over_win(stacks, 4, 1)
    assert 4 not in mistake_columns(stacks, 1, NORMAL_MISTAKE_DEPTH)
    assert 4 not in {planned_move("normal", seed, LATE_MISTAKES) for seed in SEEDS}


def test_normal_plays_the_best_move_when_no_mistake_exists() -> None:
    assert len(LATE_NO_MISTAKE) >= NORMAL_OPENING_STONES
    assert mistake_columns(stones(LATE_NO_MISTAKE), 0, NORMAL_MISTAKE_DEPTH) == []
    assert all(planned_move("normal", seed, LATE_NO_MISTAKE) is None for seed in SEEDS)


def test_the_movers_own_connect_four_refutes_a_forced_win() -> None:
    stacks = stones(OWN_WIN_REFUTES)
    # After column 3 the opponent's only forcing try leaves the mover a win of its own.
    stacks[2].append(0)
    assert not forces_win(stacks, 1, 2)
    stacks[2].pop()
    assert mistake_columns(stacks, 0, 2) == [0, 1, 3, 5, 6]


def test_forces_win_counts_the_attackers_own_moves() -> None:
    # The first mover connects four with its next stone in column 1.
    assert forces_win(stones(BOTH_THREATEN), 0, 1)
    # Quiet: nobody connects four at once, and the mover cannot force it within two moves.
    assert not forces_win(stones(LATE_NO_MISTAKE), 0, 1)
    assert not forces_win(stones(LATE_NO_MISTAKE), 0, 2)


def test_full_columns_are_never_picked() -> None:
    history = "444444"
    assert 3 not in {planned_move("easy", seed, history) for seed in SEEDS}
