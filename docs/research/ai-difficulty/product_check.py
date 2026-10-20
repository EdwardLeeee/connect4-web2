"""Plays the shipped Easy and Normal levels (difficulty.planned_move + the native solver)
against the simple player proxies, to check they match the strength sim.mjs measured.

usage: python product_check.py <repo>/backend <level> <opponent> <ai seat 1|2> <games> <seed>
level: easy | normal; opponent: random | novice | casual | sharp (as in sim.mjs).
Prints one JSON line per game.

       python product_check.py <repo>/backend table-hits <jsonl dir>
prints how often native_solver/data/reply-table.bin holds the position when the AI is to move
after 8 to 13 moves. It reads the file itself, so a native module built from an older table
does not change the count.
"""

import collections
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])

from connect4_app import _solver  # noqa: E402
from connect4_app.difficulty import (  # noqa: E402
    connects_four,
    forces_win,
    hands_over_win,
    open_columns,
    planned_move,
    stones,
)

CENTRE_WEIGHT = [1, 2, 3, 4, 3, 2, 1]


def proxy(kind: str, history: str, rng: random.Random) -> int:
    stacks, me = stones(history), len(history) % 2
    legal = [column for column in range(7) if len(stacks[column]) < 6]
    if kind == "random":
        return rng.choice(legal)
    for target in (me, 1 - me):
        for column in legal:
            if connects_four(stacks, column, target):
                return column
    if kind == "novice":
        return rng.choice(legal)
    if kind == "sharp":
        # A move after which every reply leaves it a connect four: a forced win in two.
        for column in legal:
            stacks[column].append(me)
            replies = open_columns(stacks)
            forced = bool(replies) and not any(
                connects_four(stacks, reply, 1 - me) for reply in replies
            )
            for reply in replies:
                if not forced:
                    break
                stacks[reply].append(1 - me)
                forced = forces_win(stacks, me, 1)
                stacks[reply].pop()
            stacks[column].pop()
            if forced:
                return column
    pool = [column for column in legal if not hands_over_win(stacks, column, me)] or legal
    return rng.choices(pool, weights=[CENTRE_WEIGHT[column] for column in pool])[0]


def table_keys() -> set[int]:
    """The keys in the committed reply table (native_solver/src/reply_table.rs)."""
    data = (Path(sys.argv[1]).parent / "native_solver" / "data" / "reply-table.bin").read_bytes()
    count = int.from_bytes(data[8:12], "little")
    return {int.from_bytes(data[16 + 15 * i : 24 + 15 * i], "little") for i in range(count)}


def table_key(history: str) -> int:
    """connect-four-ai's Position::get_key: shared by a position and its mirror image."""
    position = mask = 0
    for move in history:
        position ^= mask
        mask |= mask + (1 << ((int(move) - 1) * 7))
    mirrored_position = mirrored_mask = 0
    for column in range(7):
        bits = ((1 << 6) - 1) << (column * 7)
        shift = (6 - 2 * column) * 7
        for value, target in ((position, "p"), (mask, "m")):
            moved = (value & bits) << shift if shift >= 0 else (value & bits) >> -shift
            if target == "p":
                mirrored_position |= moved
            else:
                mirrored_mask |= moved
    return min(position + mask, mirrored_position + mirrored_mask)


def table_hits(directory: str) -> None:
    keys = table_keys()
    hits: collections.Counter[tuple[str, int]] = collections.Counter()
    total: collections.Counter[tuple[str, int]] = collections.Counter()
    for path in sorted(Path(directory).glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            game = json.loads(line)
            for moves in range(8, 14):
                # The AI is to move after an even number of moves when it moves first.
                if (moves % 2 == 0) != (game["aiSeat"] == 1) or len(game["history"]) <= moves:
                    continue
                key = (f"{game['ai']}, AI first" if game["aiSeat"] == 1 else game["ai"], moves)
                total[key] += 1
                hits[key] += table_key(game["history"][:moves]) in keys
    for key in sorted(total):
        print(f"{key[0]}, after {key[1]} moves: {hits[key]}/{total[key]} in the table")


def main() -> None:
    if sys.argv[2] == "table-hits":
        table_hits(sys.argv[3])
        return
    _, _, level, opponent, seat, games, seed = sys.argv
    rng = random.Random(int(seed))
    ai_seat = int(seat)
    for _ in range(int(games)):
        game_seed = rng.getrandbits(64)
        history, winner = "", 0
        while len(history) < 42:
            mover = len(history) % 2 + 1
            if mover == ai_seat:
                column = planned_move(level, game_seed, history)  # type: ignore[arg-type]
                if column is None:
                    column = _solver.best_move(history)
            else:
                column = proxy(opponent, history, rng)
            won = connects_four(stones(history), column, len(history) % 2)
            history += str(column + 1)
            if won:
                winner = mover
                break
        result = "draw" if winner == 0 else "ai" if winner == ai_seat else "opp"
        print(
            json.dumps(
                {
                    "ai": level,
                    "opp": opponent,
                    "aiSeat": ai_seat,
                    "result": result,
                    "history": history,
                }
            )
        )


main()
