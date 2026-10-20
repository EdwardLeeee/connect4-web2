"""How the Easy and Normal AIs depart from the Super AI's exact best move.

Every level plays the exact best move (`PerfectSolver.best_move`) unless `planned_move`
picks a column without the solver:

- Super never does.
- Normal plays the best move outright while fewer than `NORMAL_OPENING_STONES` stones are
  on the board.
- Otherwise Easy and Normal always take a win in one, and then block the opponent's win in
  one.
- Easy plays a random column on `EASY_RANDOM_PERCENT` of its other moves; with
  `EASY_RANDOM_IS_SAFE` the random column never hands the opponent a win in one.
- On `NORMAL_MISTAKE_PERCENT` of its other moves Normal makes a deliberate mistake when one
  exists: a column after which the opponent cannot win at once but can force a win within
  `NORMAL_MISTAKE_DEPTH` of its own moves (`mistake_columns`, a short tactical search, not
  the solver). When none exists it plays the best move.

These are deliberate levels, not fallbacks: whether a move is random or a mistake is drawn
before any solving, and when the best move is needed and the solver fails, the game reports
`solver_unavailable` at every level. Draws use integers only and depend on nothing but the
game's seed and moves, so replaying a game picks the same columns; the app's on-device AI
must match them (tests/local_parity.py records difficulty-parity.json for it).
Strengths are measured in docs/research/2026-10-ai-difficulty.md.
"""

from __future__ import annotations

from .domain import COLUMNS, ROWS, Difficulty

DIFFICULTIES: tuple[Difficulty, ...] = ("easy", "normal", "super")
# The user's picks (docs/research/2026-10-ai-difficulty.md): Easy is the 2026-10-19 Normal,
# Normal the 2026-10-20 one. frontend/src/local/difficulty.ts repeats them at its top.
EASY_RANDOM_PERCENT = 50
EASY_RANDOM_IS_SAFE = True
NORMAL_OPENING_STONES = 12
NORMAL_MISTAKE_PERCENT = 50
NORMAL_MISTAKE_DEPTH = 2

# The salts of the draws a move can make: Easy's two, then Normal's two.
RANDOM_OR_BEST = 1
WHICH_COLUMN = 2
MISTAKE_OR_BEST = 3
WHICH_MISTAKE = 4
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
    if difficulty == "normal" and len(history) < NORMAL_OPENING_STONES:
        return None
    stacks = stones(history)
    player = len(history) % 2
    legal = open_columns(stacks)
    # Its own win first, then the opponent's.
    for target in (player, 1 - player):
        for column in legal:
            if connects_four(stacks, column, target):
                return column
    if difficulty == "easy":
        if draw(seed, history, RANDOM_OR_BEST) % 100 >= EASY_RANDOM_PERCENT:
            return None
        candidates = legal
        if EASY_RANDOM_IS_SAFE:
            candidates = [
                column for column in legal if not hands_over_win(stacks, column, player)
            ] or legal
        return candidates[draw(seed, history, WHICH_COLUMN) % len(candidates)]
    if draw(seed, history, MISTAKE_OR_BEST) % 100 >= NORMAL_MISTAKE_PERCENT:
        return None
    mistakes = mistake_columns(stacks, player, NORMAL_MISTAKE_DEPTH)
    if not mistakes:
        return None
    return mistakes[draw(seed, history, WHICH_MISTAKE) % len(mistakes)]


def mistake_columns(stacks: list[list[int]], player: int, depth: int) -> list[int]:
    """The columns, in order, after which the opponent cannot win at once but can force a win
    within `depth` of its own moves."""
    found = []
    for column in open_columns(stacks):
        if hands_over_win(stacks, column, player):
            continue
        stacks[column].append(player)
        try:
            if forces_win(stacks, 1 - player, depth):
                found.append(column)
        finally:
            stacks[column].pop()
    return found


def forces_win(stacks: list[list[int]], player: int, depth: int) -> bool:
    """Whether `player`, to move, can connect four within `depth` of its own moves whatever
    the other side replies. A reply that connects four itself refutes the line."""
    columns = open_columns(stacks)
    if any(connects_four(stacks, column, player) for column in columns):
        return True
    if depth <= 1:
        return False
    other = 1 - player
    for column in columns:
        stacks[column].append(player)
        try:
            replies = open_columns(stacks)
            forced = bool(replies) and not any(
                connects_four(stacks, reply, other) for reply in replies
            )
            for reply in replies:
                if not forced:
                    break
                stacks[reply].append(other)
                try:
                    forced = forces_win(stacks, player, depth - 1)
                finally:
                    stacks[reply].pop()
        finally:
            stacks[column].pop()
        if forced:
            return True
    return False


def open_columns(stacks: list[list[int]]) -> list[int]:
    return [column for column in range(COLUMNS) if len(stacks[column]) < ROWS]


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
        return any(connects_four(stacks, target, 1 - player) for target in open_columns(stacks))
    finally:
        stacks[column].pop()
