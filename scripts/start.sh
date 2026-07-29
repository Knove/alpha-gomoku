#!/usr/bin/env bash
# Production-style single-process launch (PLAN.md §10): build the frontend,
# then serve REST + WS + web/dist from one uvicorn process on :8000.
#
#   scripts/start.sh                    # build web, serve data/runs/dev
#   RUN=data/runs/exp CONFIG=configs/fast.json PORT=8001 scripts/start.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/web"
npm install
npm run build

cd "$ROOT"
RUN="${RUN:-data/runs/dev}"
PORT="${PORT:-8000}"
PY="${PYTHON:-$ROOT/.venv/bin/python}"
[ -x "$PY" ] || PY="python3"

ARGS=(--run "$RUN" --port "$PORT")
if [ -n "${CONFIG:-}" ]; then
  ARGS+=(--config "$CONFIG")
fi

echo "[start] serving run '$RUN' on http://localhost:${PORT}"
exec "$PY" -m server.app "${ARGS[@]}"
