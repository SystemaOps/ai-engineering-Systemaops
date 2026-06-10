#!/usr/bin/env bash
# Pull the latest curriculum, rebuild the site image, and restart.
# Run from anywhere: ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
docker compose build --pull
docker compose up -d
docker image prune -f

echo "Deployed. Site container status:"
docker compose ps
