#!/usr/bin/env bash
# Cut a release from the dev machine: bump the version, verify, commit, tag, push.
# CI then tests, builds the image and publishes it to GHCR; the production host
# deploys it with deploy/deploy.sh <tag>.
#
# Usage: scripts/release.sh patch|minor [--dry-run]
#   patch     small change   3.0.0 -> 3.0.1
#   minor     large change   3.0.0 -> 3.1.0
#   --dry-run run every check but do not commit, tag or push; restore the files after
#
# GIT_TRAILER="Co-Authored-By: ..." adds a trailer to the release commit when set.
set -euo pipefail

usage() {
    echo "usage: scripts/release.sh patch|minor [--dry-run]" >&2
    exit 2
}

BUMP=""
DRY_RUN=0
for arg in "$@"; do
    case "${arg}" in
        patch|minor) BUMP="${arg}" ;;
        --dry-run) DRY_RUN=1 ;;
        *) usage ;;
    esac
done
[ -n "${BUMP}" ] || usage

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
PY="${ROOT}/.venv/bin/python"
[ -x "${PY}" ] || { echo "missing .venv; run: python3 -m venv .venv && .venv/bin/python -m pip install -e '.[dev]'" >&2; exit 1; }
command -v rg >/dev/null || { echo "ripgrep (rg) is required" >&2; exit 1; }

# --- preconditions --------------------------------------------------------------
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "${branch}" = "main" ] || { echo "release from main only (currently on ${branch})" >&2; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "tracked files have uncommitted changes; commit or stash them first:" >&2
    git status --short --untracked-files=no >&2
    exit 1
fi
git fetch --quiet origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "main is not in sync with origin/main; pull or push first" >&2
    exit 1
fi

# --- compute the new version ------------------------------------------------------
current="$(sed -n 's/^version = "\(.*\)"$/\1/p' pyproject.toml)"
if ! [[ "${current}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "cannot parse version '${current}' in pyproject.toml" >&2
    exit 1
fi
major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
case "${BUMP}" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
esac
new="${major}.${minor}.${patch}"
tag="v${new}"
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null \
    || git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
    echo "tag ${tag} already exists" >&2
    exit 1
fi
echo "release ${current} -> ${new} (${BUMP})$( [ "${DRY_RUN}" = 1 ] && echo ' [dry run]')"

VERSION_FILES=(pyproject.toml frontend/package.json frontend/package-lock.json)
cleanup() {
    status=$?
    if [ "${DRY_RUN}" = 1 ] || [ "${status}" -ne 0 ]; then
        git checkout --quiet -- "${VERSION_FILES[@]}" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# --- write the version -------------------------------------------------------------
# pyproject.toml is the source of truth: the backend reads it through package metadata
# and the Containerfile installs whatever wheel was built, so nothing else is edited.
# native_solver/Cargo.toml is left alone on purpose; it affects no artifact.
sed -i "s/^version = \"${current}\"$/version = \"${new}\"/" pyproject.toml
npm --prefix frontend version "${new}" --no-git-tag-version >/dev/null
grep -q "^version = \"${new}\"$" pyproject.toml
node -e "process.exit(require('./frontend/package.json').version === '${new}' ? 0 : 1)"

# --- no stale copies of the old version in anything a build or deploy consumes ------
# (the 3.0.0 release broke because the Containerfile still pinned the old version)
# Comment lines are ignored so that examples in scripts do not trip the check.
stale="$(rg -n --fixed-strings "${current}" \
    Containerfile .github deploy scripts backend tests native_solver/src \
    frontend/src frontend/index.html frontend/public 2>/dev/null \
    | rg -v '^[^:]*:[0-9]+:[[:space:]]*#' || true)"
if [ -n "${stale}" ]; then
    echo "${stale}"
    echo "the old version ${current} still appears in the files above; fix them first" >&2
    exit 1
fi

# --- quick verification (e2e and the container build are CI's job) -----------------
"${PY}" -m ruff check backend tests
"${PY}" -m pytest -q
npm --prefix frontend test
npm --prefix frontend run build

if [ "${DRY_RUN}" = 1 ]; then
    echo "dry run complete: would commit 'Release ${new}', tag ${tag}, then push main and the tag"
    exit 0
fi

# --- commit, tag, push -------------------------------------------------------------
git add "${VERSION_FILES[@]}"
if [ -n "${GIT_TRAILER:-}" ]; then
    git commit --quiet -m "Release ${new}" -m "${GIT_TRAILER}"
else
    git commit --quiet -m "Release ${new}"
fi
git tag -a "${tag}" -m "Connect 4 ${new}"
git push origin main
git push origin "${tag}"

cat <<EOF

pushed ${tag}. next:
  gh run watch                 # wait for CI to go green; it publishes the image to GHCR
  deploy/deploy.sh ${tag}      # then run this on the production host
EOF
