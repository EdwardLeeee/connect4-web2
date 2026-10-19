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


def results(directories: list[str]) -> None:
    cells: dict[tuple[str, str, int], collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    for _, game in games(directories):
        cells[(game["ai"], game["opp"], game["aiSeat"])][game["result"]] += 1
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["ai", "opponent", "ai_moves_first", "games", "ai_wins", "draws", "opponent_wins"])
    for (ai, opponent, seat), count in sorted(cells.items()):
        total = sum(count.values())
        out.writerow([ai, opponent, seat == 1, total, count["ai"], count["draw"], count["opp"]])


def timing(directory: str) -> None:
    cells: dict[tuple[str, str, int], list[dict]] = collections.defaultdict(list)
    for path, game in games([directory]):
        solver = "fresh" if "__fresh__" in path.name else "warm"
        cells[(game["ai"], solver, game["aiSeat"])].append(game)
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(
        [
            "ai",
            "solver",
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
        ]
    )
    for (ai, solver, seat), cell in sorted(cells.items()):
        solves = [ms for game in cell for ply, ms in game["slow"] if ply >= 8]
        ai_moves = sum((game["plies"] + (1 if seat == 1 else 0)) // 2 for game in cell)
        totals = [sum(ms for _, ms in game["slow"]) for game in cell]
        solves.sort()
        out.writerow(
            [
                ai,
                solver,
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
            ]
        )


if __name__ == "__main__":
    if sys.argv[1] == "results":
        results(sys.argv[2:])
    else:
        timing(sys.argv[2])
