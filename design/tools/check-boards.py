"""Check the round-2 fixture boards: gravity, move counts, and four-in-a-row.

Usage: python3 design/tools/check-boards.py
"""
import re
from pathlib import Path

source = Path(__file__).parents[1] / "mockups/round2/states.js"
text = source.read_text()
boards = {}
for name, body in re.findall(r"const (B\w+) = rows\(([^;]*?)\);", text, re.S):
    boards[name] = re.findall(r'"([.GP]{7})"', body)


def fours(grid, colour):
    hits = []
    for r in range(6):
        for c in range(7):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + i * dr, c + i * dc) for i in range(4)]
                if all(0 <= rr < 6 and 0 <= cc < 7 and grid[rr][cc] == colour for rr, cc in cells):
                    hits.append(cells)
    return hits


for name, grid in boards.items():
    assert len(grid) == 6, name
    floating = [
        (r, c) for r in range(5) for c in range(7) if grid[r][c] != "." and grid[r + 1][c] == "."
    ]
    g = sum(row.count("G") for row in grid)
    p = sum(row.count("P") for row in grid)
    print(
        f"{name:8} G={g:2} P={p:2} moves={g + p:2} floating={floating} "
        f"green4={fours(grid, 'G')[:2]} pink4={fours(grid, 'P')[:2]}"
    )
