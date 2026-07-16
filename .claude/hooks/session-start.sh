#!/usr/bin/env bash
# SessionStart hook: ensure the project is ready to build, test and run.
set -e
cd "$(dirname "$0")/../.."

# Start PostgreSQL if it isn't already accepting connections.
if ! pg_isready -q 2>/dev/null; then
  service postgresql start >/dev/null 2>&1 || pg_ctlcluster 16 main start >/dev/null 2>&1 || true
fi

# Install workspace dependencies if missing.
if [ ! -d node_modules ]; then
  npm install >/dev/null 2>&1 || true
fi

# Sync the Prisma schema + client.
if [ -d server ]; then
  (cd server && npx prisma db push --skip-generate >/dev/null 2>&1 && npx prisma generate >/dev/null 2>&1) || true
fi

echo "Hostel MS ready: run 'npm run dev' (API :4000, web :5173). Seed with 'npm run db:seed'."
