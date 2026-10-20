"""Turns the per-game JSONL files into the CSV tables the research note quotes.

usage:
  python summarise.py results <jsonl dir>... > results.csv
  python summarise.py timing <jsonl dir> > timing.csv
"""

import collections
import csv
import json
import statistics
import sys
from pathlib import Path


def games(directories: list[str]):
    for directory in directories:
        for path in sorted(Path(directory).glob("*.jsonl")):
            for line in path.read_text(encoding="utf-8").splitlines():
                yield path, json.loads(line)


def per_game(count: collections.Counter[str], key: str) -> float | str:
    """The average of a per-game field; blank when the AI did not report it."""
    return round(count[key] / count["games"], 2) if count[f"has_{key}"] else ""


def results(directories: list[str]) -> None:
    cells: dict[tuple[str, str, int], collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    for _, game in games(directories):
        cell = cells[(game["ai"], game["opp"], game["aiSeat"])]
        cell[game["result"]] += 1
        cell["games"] += 1
        # forced:<N>:<p>:<d> reports its deliberate mistakes.
        if game["ai"].startswith("forced:"):
            for key in ("mistakes", "thrown", "noMistake"):
                cell[key] += game[key]
                cell[f"has_{key}"] = 1
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(
        [
            "ai",
            "opponent",
            "ai_moves_first",
            "games",
            "ai_wins",
            "draws",
            "opponent_wins",
            "mistakes_per_game",
            "thrown_per_game",
            "no_mistake_found_per_game",
        ]
    )
    for (ai, opponent, seat), count in sorted(cells.items()):
        out.writerow(
            [
                ai,
                opponent,
                seat == 1,
                count["games"],
                count["ai"],
                count["draw"],
                count["opp"],
                per_game(count, "mistakes"),
                per_game(count, "thrown"),
                per_game(count, "noMistake"),
            ]
        )


def timing(directory: str) -> None:
    cells: dict[tuple[str, str, int, bool], list[dict]] = collections.defaultdict(list)
    for path, game in games([directory]):
        solver = "fresh" if "__fresh__" in path.name else "warm"
        # Runs with TABLE= report their reply table lookups.
        cells[(game["ai"], solver, game["aiSeat"], "tableHits" in game)].append(game)
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(
        [
            "ai",
            "solver",
            "reply_table",
            "ai_moves_first",
            "games",
            "ai_moves",
            "live_solves_after_8_moves_per_game",
            "median_ms",
            "p95_ms",
            "max_ms",
            "solves_over_1s",
            "game_total_median_ms",
            "game_total_max_ms",
            "per_move_p95_ms",
            "per_move_p99_ms",
            "moves_over_1s_percent",
            "tactics_max_ms",
        ]
    )
    for (ai, solver, seat, table), cell in sorted(cells.items()):
        solves = [ms for game in cell for ply, ms in game["slow"] if ply >= 8]
        ai_moves = sum((game["plies"] + (1 if seat == 1 else 0)) // 2 for game in cell)
        totals = [sum(ms for _, ms in game["slow"]) for game in cell]
        solves.sort()
        # Every AI move, counting the ones that needed no live solve (picks, the opening book,
        # the reply table) as 0 ms. Each move solves live at most once.
        every = [ms for game in cell for _, ms in game["slow"]]
        moves = sorted(every + [0.0] * (ai_moves - len(every)))
        # With the reply table a row can have no live solve after 8 moves at all.
        solves = solves or [0.0]
        out.writerow(
            [
                ai,
                solver,
                table,
                seat == 1,
                len(cell),
                ai_moves,
                round(len(solves) / len(cell), 2),
                round(statistics.median(solves)),
                round(solves[int(0.95 * (len(solves) - 1))]),
                round(solves[-1]),
                sum(ms > 1000 for ms in solves),
                round(statistics.median(totals)),
                round(max(totals)),
                round(moves[int(0.95 * (len(moves) - 1))]),
                round(moves[int(0.99 * (len(moves) - 1))]),
                round(100 * sum(ms > 1000 for ms in moves) / len(moves), 2),
                max((game.get("tacticsMs", 0) for game in cell), default=0),
            ]
        )


if __name__ == "__main__":
    if sys.argv[1] == "results":
        results(sys.argv[2:])
    else:
        timing(sys.argv[2])
