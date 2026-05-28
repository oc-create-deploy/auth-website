#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Create it before deploying." >&2
  exit 1
fi

docker compose --env-file .env up -d --build --remove-orphans
