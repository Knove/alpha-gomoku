#!/usr/bin/env bash
# One-command dev stack (PLAN.md §3/§10): FastAPI server (+ trainer) in the
# background, vite dev server in the foreground. Ctrl-C tears everything down.
#
#   scripts/dev.sh                      # server :8000 + auto-start trainer + web :5173
#   TRAINER=0 scripts/dev.sh            # server + web only (no training)
#   CONFIG=configs/fast.json scripts/dev.sh   # seed the run with a specific config
#   RUN=data/runs/exp PORT=8001 scripts/dev.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN="${RUN:-data/runs/dev}"
PORT="${PORT:-8000}"
PY="${PYTHON:-$ROOT/.venv/bin/python}"
[ -x "$PY" ] || PY="python3"

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

ARGS=(--run "$RUN" --port "$PORT")
if [ -n "${CONFIG:-}" ]; then
  ARGS+=(--config "$CONFIG")
fi

echo "[dev] server: $PY -m server.app ${ARGS[*]}"
"$PY" -m server.app "${ARGS[@]}" &
pids+=($!)

if [ "${TRAINER:-1}" != "0" ]; then
  # Ask the server to start training as soon as it answers.
  (
    for _ in $(seq 1 60); do
      if curl -sf "http://localhost:${PORT}/api/status" >/dev/null 2>&1; then
        curl -sf -X POST "http://localhost:${PORT}/api/control" \
          -H 'Content-Type: application/json' \
          -d '{"action":"start"}' >/dev/null 2>&1 || true
        break
      fi
      sleep 0.5
    done
  ) &
  pids+=($!)
fi

echo "[dev] web: npm run dev (proxy /api and /ws -> localhost:${PORT})"
cd "$ROOT/web"
npm run dev &
pids+=($!)

wait
