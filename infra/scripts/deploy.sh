#!/usr/bin/env bash
# Runs on the VPS (as the deploy user) for every release. GitHub Actions calls it with the image
# tag to install; it can also be run by hand to roll back: ./deploy.sh <older-commit-sha>
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
cd /opt/enhora

# Remember the tag so a plain `docker compose up -d` after a reboot keeps this version.
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${TAG}/" .env

docker compose -f compose.prod.yml pull --quiet
# migrate runs first (the API depends on it); a failed migration leaves the old API running.
docker compose -f compose.prod.yml up -d --remove-orphans --wait --wait-timeout 180
docker image prune -f >/dev/null

echo "Deployed ${TAG}"
docker compose -f compose.prod.yml ps --format 'table {{.Service}}\t{{.Status}}'
