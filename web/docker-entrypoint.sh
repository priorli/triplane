#!/bin/sh
# docker-entrypoint.sh
#
# Runs Prisma migrations against the configured database, then exec's into
# the main process (node server.js by default). If migrations fail, the
# container exits non-zero and does NOT start the server — this is intentional
# so that a broken schema doesn't silently serve traffic.

set -e

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Migrations complete. Starting server..."
exec "$@"
