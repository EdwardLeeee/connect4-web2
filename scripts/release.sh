#!/usr/bin/env bash
# Cut a release: bump the version on a release branch, open a pull request, let CI
# merge it, then tag the merged commit so CI publishes the image to GHCR.
#
# Usage: scripts/release.sh patch|minor [--dry-run]
#   patch     small change   3.0.0 -> 3.0.1
#   minor     large change   3.0.0 -> 3.1.0
#   --dry-run bump in a throwaway worktree and run the checks, but push nothing
#
# The script never touches the checkout it runs from: the bump happens in a throwaway
# worktree, so it is safe to run while other sessions have uncommitted work.
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

for tool in git gh rg node npm; do
    command -v "${tool}" >/dev/null || { echo "${tool} is required" >&2; exit 1; }
done
ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"
git fetch --quiet origin

# --- compute the new version from origin/main (the only source of truth) ---------
current="$(git show origin/main:pyproject.toml | sed -n 's/^version = "\(.*\)"$/\1/p')"
if ! [[ "${current}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "cannot parse version '${current}' in pyproject.toml on origin/main" >&2
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
branch="release/${tag}"
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null \
    || git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
    echo "tag ${tag} already exists" >&2
    exit 1
fi
if git ls-remote --exit-code --heads origin "refs/heads/${branch}" >/dev/null 2>&1; then
    echo "branch ${branch} already exists on origin; finish or delete that release first" >&2
    exit 1
fi
echo "release ${current} -> ${new} (${BUMP})$( [ "${DRY_RUN}" = 1 ] && echo ' [dry run]')"

# --- bump in a throwaway worktree -------------------------------------------------
WT="$(mktemp -d "${TMPDIR:-/tmp}/connect4-release.XXXXXX")"
cleanup() {
    git worktree remove --force "${WT}" 2>/dev/null || true
    git branch -D "${branch}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
rmdir "${WT}"
git worktree add --quiet -b "${branch}" "${WT}" origin/main

# pyproject.toml is the source of truth: the backend reads it through package metadata
# and the Containerfile installs whatever wheel was built, so nothing else is edited.
# native_solver/Cargo.toml is left alone on purpose; it affects no artifact.
sed -i "s/^version = \"${current}\"$/version = \"${new}\"/" "${WT}/pyproject.toml"
npm --prefix "${WT}/frontend" version "${new}" --no-git-tag-version >/dev/null
grep -q "^version = \"${new}\"$" "${WT}/pyproject.toml"
node -e "process.exit(require('${WT}/frontend/package.json').version === '${new}' ? 0 : 1)"

# No stale copies of the old version in anything a build or deploy consumes (the 3.0.0
# release broke because the Containerfile still pinned the old version). Comment lines
# are ignored so that examples in scripts do not trip the check.
stale="$(cd "${WT}" && rg -n --fixed-strings "${current}" \
    Containerfile .github deploy scripts backend tests native_solver/src \
    frontend/src frontend/index.html frontend/public 2>/dev/null \
    | rg -v '^[^:]*:[0-9]+:[[:space:]]*#' || true)"
if [ -n "${stale}" ]; then
    echo "${stale}"
    echo "the old version ${current} still appears in the files above; fix them first" >&2
    exit 1
fi

git -C "${WT}" add pyproject.toml frontend/package.json frontend/package-lock.json
git -C "${WT}" commit --quiet -m "Release ${new}"

if [ "${DRY_RUN}" = 1 ]; then
    echo "dry run complete: would push ${branch}, open a pull request, merge it when CI is green, then tag ${tag}"
    exit 0
fi

# --- pull request, auto-merge on green, tag the merged commit ---------------------
git -C "${WT}" push --quiet -u origin "${branch}"
pr_url="$(cd "${WT}" && gh pr create --base main --head "${branch}" \
    --title "Release ${new}" \
    --body "Version bump for ${tag}. Merging tags the squashed commit; CI then publishes the image to GHCR.")"
echo "pull request: ${pr_url}"
gh pr merge --auto --squash "${pr_url}"

echo "waiting for CI and the merge (this takes about five minutes)..."
state=""
for _ in $(seq 1 60); do
    sleep 20
    state="$(gh pr view "${pr_url}" --json state --jq .state)"
    case "${state}" in
        MERGED) break ;;
        CLOSED) echo "pull request was closed without merging" >&2; exit 1 ;;
    esac
    if gh pr checks "${pr_url}" --json bucket --jq '.[].bucket' 2>/dev/null | grep -qx fail; then
        echo "a required check failed; fix it and rerun the release" >&2
        gh pr checks "${pr_url}" >&2 || true
        exit 1
    fi
done
[ "${state}" = "MERGED" ] || { echo "timed out waiting for the merge; check ${pr_url}" >&2; exit 1; }

merged="$(gh pr view "${pr_url}" --json mergeCommit --jq .mergeCommit.oid)"
git fetch --quiet origin main "${merged}"
if ! git show "${merged}:pyproject.toml" | grep -q "^version = \"${new}\"$"; then
    echo "merged commit ${merged} does not carry version ${new}; not tagging" >&2
    exit 1
fi
git tag -a "${tag}" -m "Connect 4 ${new}" "${merged}"
git push --quiet origin "${tag}"

cat <<EOF

merged ${pr_url} as ${merged:0:7} and pushed ${tag}. next:
  gh run watch                 # CI builds the image and publishes it to GHCR
  deploy/deploy.sh ${tag}      # then run this on the production host
EOF
