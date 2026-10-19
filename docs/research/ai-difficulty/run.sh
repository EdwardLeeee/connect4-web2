#!/usr/bin/env bash
# Reruns every measurement in docs/research/2026-10-ai-difficulty.md into <out dir>.
# Needs `npm --prefix frontend ci` (for the WASM engine) and the .venv with the native
# solver (for product_check.py). The win-rate runs use every CPU thread; the timing runs go
# one at a time so solves do not compete for the CPU.
# usage: docs/research/ai-difficulty/run.sh <out dir>
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
pkg=$repo/frontend/node_modules/connect-four-ai-wasm
python=${PYTHON:-$repo/.venv/bin/python}
out=${1:?usage: run.sh <out dir>}
mkdir -p "$out/results" "$out/product" "$out/timing"

grep -v '^#' "$here/jobs.txt" | while read -r ai opponent seat games seed; do
  echo "node '$here/sim.mjs' '$pkg' $ai $opponent $seat $games $seed > '$out/results/${ai/:/_}__${opponent/:/_}__${seat}__${seed}.jsonl'"
done | xargs -P "$(nproc)" -I{} bash -c "{}"

grep -v '^#' "$here/product-jobs.txt" | while read -r level opponent seat games seed; do
  echo "'$python' '$here/product_check.py' '$repo/backend' $level $opponent $seat $games $seed > '$out/product/${level}__${opponent}__${seat}.jsonl'"
done | xargs -P "$(nproc)" -I{} bash -c "{}"

grep -v '^#' "$here/timing-jobs.txt" | while read -r mode ai opponent seat games seed; do
  TIMING=$mode node "$here/sim.mjs" "$pkg" "$ai" "$opponent" "$seat" "$games" "$seed" \
    > "$out/timing/${ai/:/_}__${mode}__${seat}.jsonl"
done

python3 "$here/summarise.py" results "$out/results" > "$out/results.csv"
python3 "$here/summarise.py" results "$out/product" > "$out/product.csv"
"$python" "$here/product_check.py" "$repo/backend" table-hits "$out/product" > "$out/table-hits.txt"
python3 "$here/summarise.py" timing "$out/timing" > "$out/timing.csv"
