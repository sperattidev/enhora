#!/usr/bin/env bash
# Runs on the VPS (as the deploy user) for every release. GitHub Actions calls it with the image
# tag to install; it can also be run by hand to roll back: ./deploy.sh <older-commit-sha>
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
cd /opt/enhora
compose() { docker compose -f compose.prod.yml "$@"; }

# Remember the tag so a plain `docker compose up -d` after a reboot keeps this version.
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${TAG}/" .env

compose pull --quiet
# migrate runs first and the API depends on it: if a migration fails, compose stops here and the
# running API is left untouched.
compose up -d --remove-orphans

echo "Waiting for the API to report healthy..."
for _ in $(seq 1 60); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q api)" 2>/dev/null || echo starting)
  if [[ "$status" == healthy ]]; then
    docker image prune -f >/dev/null
    echo "Deployed ${TAG}"
    compose ps --format 'table {{.Service}}\t{{.Status}}'
    exit 0
  fi
  sleep 3
done

echo "API did not become healthy in time. Recent logs:" >&2
compose logs --tail 80 api migrate >&2
exit 1
