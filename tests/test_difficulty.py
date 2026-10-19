from collections import Counter

import pytest
from connect4_app.difficulty import (
    EASY_RANDOM_IS_SAFE,
    EASY_RANDOM_PERCENT,
    NORMAL_RANDOM_IS_SAFE,
    NORMAL_RANDOM_PERCENT,
    RANDOM_OR_BEST,
    draw,
    mix,
    planned_move,
)

SEEDS = range(1000)
# The first mover has three in column 1, the second mover three in column 2.
BOTH_THREATEN = "121212"
# The first mover has three in column 1 and the second mover must block it.
MUST_BLOCK = "12121"
# Quiet for both sides, but the second mover's stone in column 5 would let the first mover
# connect row 2 from column 3 to column 6.
COLUMN_5_HANDS_OVER = "4337466"


def test_mix_is_splitmix64() -> None:
    # The first output of the reference SplitMix64 generator seeded with 0.
    assert mix(0) == 0xE220A8397B1DCDAF


def test_draws_depend_only_on_seed_history_and_salt() -> None:
    assert draw(7, "44", 1) == draw(7, "44", 1)
    assert len({draw(7, "44", 1), draw(8, "44", 1), draw(7, "43", 1), draw(7, "44", 2)}) == 4
    assert draw(2**64 + 7, "44", 1) == draw(7, "44", 1)


@pytest.mark.parametrize("history", ["", "4", BOTH_THREATEN, MUST_BLOCK, COLUMN_5_HANDS_OVER])
def test_super_always_plays_the_best_move(history: str) -> None:
    assert all(planned_move("super", seed, history) is None for seed in SEEDS)


@pytest.mark.parametrize(
    ("difficulty", "percent", "safe"),
    [
        ("easy", EASY_RANDOM_PERCENT, EASY_RANDOM_IS_SAFE),
        ("normal", NORMAL_RANDOM_PERCENT, NORMAL_RANDOM_IS_SAFE),
    ],
)
def test_each_level_plays_at_random_on_its_share_of_moves(
    difficulty: str, percent: int, safe: bool
) -> None:
    picks = Counter(planned_move(difficulty, seed, COLUMN_5_HANDS_OVER) for seed in SEEDS)  # type: ignore[arg-type]
    assert abs(1 - picks[None] / len(SEEDS) - percent / 100) < 0.05
    assert (None in picks) is (percent < 100)
    # Only a safe level avoids column 5, which would hand the first mover a win.
    assert set(picks) - {None} == set(range(7)) - ({4} if safe else set())


@pytest.mark.parametrize("difficulty", ["easy", "normal"])
def test_each_level_takes_its_win_before_blocking(difficulty: str) -> None:
    assert {planned_move(difficulty, seed, BOTH_THREATEN) for seed in SEEDS} == {0}  # type: ignore[arg-type]


@pytest.mark.parametrize("difficulty", ["easy", "normal"])
def test_each_level_blocks_a_win_in_one(difficulty: str) -> None:
    assert {planned_move(difficulty, seed, MUST_BLOCK) for seed in SEEDS} == {0}  # type: ignore[arg-type]


def test_random_or_best_is_decided_by_the_first_draw() -> None:
    for seed in SEEDS:
        random_move = draw(seed, "4", RANDOM_OR_BEST) % 100 < NORMAL_RANDOM_PERCENT
        assert (planned_move("normal", seed, "4") is not None) is random_move


def test_full_columns_are_never_picked() -> None:
    history = "444444"
    assert 3 not in {planned_move("easy", seed, history) for seed in SEEDS}
