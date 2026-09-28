#!/bin/sh
# ---------------------------------------------------------------------------
# Container entrypoint for the ClassHub API.
#
# Applies any pending Prisma migrations before starting the server, so that a
# fresh volume comes up with a correct schema and a code deploy that adds a
# column does not crash-loop against an outdated database.
#
# `set -e` matters: if a migration fails we must not start the API against a
# half-migrated database.
# ---------------------------------------------------------------------------
set -e

PRISMA="/app/node_modules/.bin/prisma"
SCHEMA="/app/prisma/schema.prisma"

echo "==> applying database migrations"
"$PRISMA" migrate deploy --schema="$SCHEMA"

echo "==> starting ClassHub API"
exec "$@"
