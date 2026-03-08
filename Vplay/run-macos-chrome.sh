#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4173}"
HOST="${HOST:-127.0.0.1}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
URL="http://${HOST}:${PORT}"
NO_OPEN="${NO_OPEN:-0}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if lsof -i TCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[INFO] Port $PORT already in use. Reusing existing server."
  SERVER_PID=""
else
  echo "[INFO] Starting local server from: $ROOT_DIR"
  python3 -m http.server "$PORT" --bind "$HOST" --directory "$ROOT_DIR" >/tmp/vplay-server.log 2>&1 &
  SERVER_PID=$!
fi

for _ in {1..50}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  echo "[ERROR] Server did not become ready: $URL"
  exit 1
fi

echo "[OK] Vplay ready: $URL"

if [[ "$NO_OPEN" == "1" ]]; then
  echo "[INFO] NO_OPEN=1 so browser launch skipped."
  wait "${SERVER_PID:-}" || true
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[WARN] Non-macOS environment. Open this URL manually in Chrome: $URL"
  wait "${SERVER_PID:-}" || true
  exit 0
fi

if ! open -a "Google Chrome" "$URL"; then
  echo "[WARN] Could not launch Google Chrome automatically."
  echo "       Open manually: $URL"
fi

echo "[INFO] Press Ctrl+C to stop local server."
wait "${SERVER_PID:-}" || true
