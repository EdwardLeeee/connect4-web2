"""How the Easy and Normal AIs depart from the Super AI's exact best move.

Every level plays the exact best move (`PerfectSolver.best_move`) unless `planned_move`
picks a column without the solver:

- Super never does.
- Easy plays a random legal column on `EASY_RANDOM_PERCENT` of its moves.
- Normal always takes a win in one and blocks the opponent's win in one. On
  `NORMAL_RANDOM_PERCENT` of its other moves it plays at random, avoiding columns that hand
  the opponent a win in one when `NORMAL_RANDOM_IS_SAFE` is set.

These are deliberate levels, not fallbacks: whether a move is random is drawn before any
solving, and when the best move is needed and the solver fails, the game reports
`solver_unavailable` at every level. Draws use integers only and depend on nothing but the
game's seed and moves, so replaying a game picks the same columns; the app's on-device AI
must match them (tests/local_parity.py records difficulty-parity.json for it).
Strengths are measured in docs/research/2026-10-ai-difficulty.md.
"""

from __future__ import annotations

from .domain import COLUMNS, ROWS, Difficulty

DIFFICULTIES: tuple[Difficulty, ...] = ("easy", "normal", "super")
# Placeholders until the user picks the strengths.
EASY_RANDOM_PERCENT = 60
NORMAL_RANDOM_PERCENT = 90
NORMAL_RANDOM_IS_SAFE = True

# The salts of the two draws a move can make.
RANDOM_OR_BEST = 1
WHICH_COLUMN = 2
MASK = (1 << 64) - 1


def mix(value: int) -> int:
    """One SplitMix64 step."""
    value = (value + 0x9E3779B97F4A7C15) & MASK
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & MASK
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & MASK
    return value ^ (value >> 31)


def draw(seed: int, history: str, salt: int) -> int:
    """A 64-bit value fixed by the game's seed, the moves so far and the salt."""
    value = seed & MASK
    for move in history:
        value = mix(value ^ ord(move))
    return mix(value ^ salt)


def planned_move(difficulty: Difficulty, seed: int, history: str) -> int | None:
    """The column this level plays without the solver, or None for the exact best move."""
    if difficulty == "super":
        return None
    stacks = stones(history)
    player = len(history) % 2
    legal = [column for column in range(COLUMNS) if len(stacks[column]) < ROWS]
    percent = EASY_RANDOM_PERCENT
    if difficulty == "normal":
        # Its own win first, then the opponent's.
        for target in (player, 1 - player):
            for column in legal:
                if connects_four(stacks, column, target):
                    return column
        percent = NORMAL_RANDOM_PERCENT
    if draw(seed, history, RANDOM_OR_BEST) % 100 >= percent:
        return None
    candidates = legal
    if difficulty == "normal" and NORMAL_RANDOM_IS_SAFE:
        candidates = [
            column for column in legal if not hands_over_win(stacks, column, player)
        ] or legal
    return candidates[draw(seed, history, WHICH_COLUMN) % len(candidates)]


def stones(history: str) -> list[list[int]]:
    """Each column's stones from the bottom up: 0 for the first mover, 1 for the other."""
    stacks: list[list[int]] = [[] for _ in range(COLUMNS)]
    for index, move in enumerate(history):
        stacks[int(move) - 1].append(index % 2)
    return stacks


def connects_four(stacks: list[list[int]], column: int, player: int) -> bool:
    """Whether `player` connects four by dropping into the open `column`."""
    row = len(stacks[column])

    def owner(target_column: int, target_row: int) -> int | None:
        if 0 <= target_column < COLUMNS and 0 <= target_row < len(stacks[target_column]):
            return stacks[target_column][target_row]
        return None

    for delta_column, delta_row in ((1, 0), (0, 1), (1, 1), (1, -1)):
        count = 1
        for sign in (1, -1):
            target_column = column + delta_column * sign
            target_row = row + delta_row * sign
            while owner(target_column, target_row) == player:
                count += 1
                target_column += delta_column * sign
                target_row += delta_row * sign
        if count >= 4:
            return True
    return False


def hands_over_win(stacks: list[list[int]], column: int, player: int) -> bool:
    """Whether dropping into `column` lets the opponent connect four with their next move."""
    stacks[column].append(player)
    try:
        return any(
            connects_four(stacks, target, 1 - player)
            for target in range(COLUMNS)
            if len(stacks[target]) < ROWS
        )
    finally:
        stacks[column].pop()
