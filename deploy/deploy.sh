#!/usr/bin/env bash
# Deploy a published Connect 4 image to this host: pull, retag, restart, health-check,
# and roll back to the previous image if the service does not become healthy.
#
# Usage: deploy/deploy.sh v3.0.0            (a tag published by CI to GHCR)
#        CONNECT4_IMAGE_REPO=... deploy/deploy.sh v3.0.0   (override the registry path)
set -euo pipefail

TAG="${1:?usage: deploy.sh <image tag, e.g. v3.0.0>}"
REPO="${CONNECT4_IMAGE_REPO:-ghcr.io/edwardleeee/connect4-web}"
IMAGE="${REPO}:${TAG}"
PROD="localhost/connect4-web:production"
PREV="localhost/connect4-web:previous"
HEALTH="http://127.0.0.1:55555/api/health"

echo "pulling ${IMAGE}"
podman pull "${IMAGE}"
revision="$(podman image inspect --format '{{ index .Labels "org.opencontainers.image.revision" }}' "${IMAGE}")"
echo "image revision: ${revision:-(unknown)}"
# Compare with the commit the tag points to on GitHub, so a moved tag or a stale image
# is visible before it goes live. Images built before the label existed print (unknown).
repo_dir="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || true)"
expected="$(git -C "${repo_dir:-.}" ls-remote --tags origin "refs/tags/${TAG}^{}" 2>/dev/null | cut -f1 || true)"
if [ -n "${revision}" ] && [ -n "${expected}" ] && [ "${revision}" != "${expected}" ]; then
    echo "WARNING: image revision ${revision} differs from tag ${TAG} on origin (${expected})" >&2
fi
if podman image exists "${PROD}"; then
    podman tag "${PROD}" "${PREV}"
fi
podman tag "${IMAGE}" "${PROD}"

echo "restarting connect4.service"
systemctl --user restart connect4.service

for _ in $(seq 1 20); do
    if curl --fail --silent "${HEALTH}" >/dev/null; then
        echo "healthy: ${IMAGE} is now ${PROD}"
        curl --silent "${HEALTH}"; echo
        exit 0
    fi
    sleep 3
done

echo "health check failed after 60s; rolling back" >&2
if podman image exists "${PREV}"; then
    podman tag "${PREV}" "${PROD}"
    systemctl --user restart connect4.service
    echo "rolled back to the previous image" >&2
fi
exit 1
