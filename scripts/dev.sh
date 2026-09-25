#!/usr/bin/env bash
# Starts the whole demo: simulator, backend, frontend (Vite) and station.
#   scripts/dev.sh             simulator + backend :9000 + Vite :5173 + station
#   scripts/dev.sh --build     builds the frontend and lets the backend serve it on :9000 (no Vite)
#   STATION_SOURCE=192.168.8.100:8420 scripts/dev.sh   real station A instead of the simulator
set -euo pipefail
cd "$(dirname "$0")/.."

PY=".venv/bin/python"
[ -x "$PY" ] || PY="python3"
SOURCE="${STATION_SOURCE:-localhost:8420}"
MODE="${1:-}"
mkdir -p data
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if [ "$SOURCE" = "localhost:8420" ]; then
  python3 korko-kit/korko_sim.py > data/simulator.log 2>&1 & pids+=($!)
  echo "simulateur    http://localhost:8080"
fi

if [ "$MODE" = "--build" ]; then
  (cd frontend && npm run build > ../data/frontend-build.log 2>&1)
fi

"$PY" -m uvicorn backend.app.main:create_app --factory --port 9000 > data/backend.log 2>&1 & pids+=($!)
echo "backend       http://localhost:9000   (doc de l'API : /docs)"

WEB=9000
if [ "$MODE" != "--build" ]; then
  (cd frontend && exec npm run dev -- --clearScreen false > ../data/frontend.log 2>&1) & pids+=($!)
  echo "frontend      http://localhost:5173"
  WEB=5173
fi

sleep 3
python3 station/station.py --source "$SOURCE" > data/station.log 2>&1 & pids+=($!)
echo "station       --source $SOURCE   (journal : data/station_A.ndjson)"
echo
echo "Client      http://localhost:$WEB/s/A"
echo "Passeport   http://localhost:$WEB/p/korko-01"
echo "Exploitant  http://localhost:$WEB/operator"
echo "MAIF        http://localhost:$WEB/partner/maif"
echo
echo "Journaux dans data/*.log. Ctrl-C pour tout arrêter."
wait
