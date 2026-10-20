"""Times Normal's mistake search in the shipped difficulty.py (the server's Python) on the
positions the sim.mjs games reached after its opening.

usage: python tactics_cost.py <repo>/backend <sim.mjs jsonl dir>
"""

import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, sys.argv[1])

from connect4_app.difficulty import NORMAL_OPENING_STONES, mistake_columns, stones  # noqa: E402

histories = []
for path in sorted(Path(sys.argv[2]).glob("forced_12*casual*.jsonl")):
    for line in path.read_text(encoding="utf-8").splitlines():
        history = json.loads(line)["history"]
        histories += [history[:n] for n in range(NORMAL_OPENING_STONES, len(history))]
for depth in (2, 3):
    times = []
    for history in histories[:4000]:
        stacks = stones(history)
        started = time.perf_counter()
        mistake_columns(stacks, len(history) % 2, depth)
        times.append((time.perf_counter() - started) * 1000)
    times.sort()
    print(
        f"depth {depth}: {len(times)} positions, median {statistics.median(times):.1f} ms, "
        f"p95 {times[int(0.95 * (len(times) - 1))]:.1f} ms, max {times[-1]:.1f} ms"
    )
