#!/usr/bin/env bash
# Give one role (front, back, ui, ceo, ...) its own worktree and branch so several
# sessions can work in parallel without disturbing the shared checkout on main.
#
# Usage: scripts/dev-worktree.sh <name> [branch]
#   scripts/dev-worktree.sh front feat/win-animation
#   scripts/dev-worktree.sh back                      # branch defaults to back/work
#
# The worktree lives next to the repo in ../connect4-web2-worktrees/<name> with its own
# .venv and node_modules. Playwright browsers come from the per-user ~/.cache/ms-playwright,
# which every worktree already shares; install them once with npx playwright install --with-deps.
set -euo pipefail

name="${1:?usage: scripts/dev-worktree.sh <name> [branch]}"
branch="${2:-${name}/work}"
ROOT="$(git rev-parse --show-toplevel)"
BASE="$(dirname "${ROOT}")/connect4-web2-worktrees"
DIR="${BASE}/${name}"

git -C "${ROOT}" fetch --quiet origin
mkdir -p "${BASE}"
if [ -d "${DIR}" ]; then
    echo "worktree already exists: ${DIR}"
elif git -C "${ROOT}" show-ref --verify --quiet "refs/heads/${branch}"; then
    git -C "${ROOT}" worktree add "${DIR}" "${branch}"
else
    git -C "${ROOT}" worktree add -b "${branch}" "${DIR}" origin/main
fi
cd "${DIR}"

# The Rust toolchain used by maturin lives in the main checkout; reuse it.
export CARGO_HOME="${ROOT}/.cargo" RUSTUP_HOME="${ROOT}/.rustup" PATH="${ROOT}/.cargo/bin:${PATH}"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -e '.[dev]'
npm --prefix frontend ci --silent

cat <<EOF

ready: ${DIR} on branch ${branch}
  cd ${DIR}
  export CARGO_HOME=${ROOT}/.cargo RUSTUP_HOME=${ROOT}/.rustup PATH=${ROOT}/.cargo/bin:\$PATH
when done: commit, git push -u origin ${branch}, gh pr create --fill, then ask the ceo to review
EOF
