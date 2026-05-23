#!/bin/bash
# backend/run-integrations.sh
# 
# Starts the integrations manager in the background
# 
# Usage:
#   ./run-integrations.sh          # Run in background
#   ./run-integrations.sh --watch  # Run with logging
#   ./run-integrations.sh --stop   # Kill the process

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.integrations.pid"

case "${1:-}" in
  --stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm "$PID_FILE"
        echo "✓ Integrations manager stopped (PID $PID)"
      else
        rm "$PID_FILE"
        echo "✗ No running process found"
      fi
    else
      echo "✗ No PID file found"
    fi
    ;;
  --watch)
    echo "Starting integrations manager (verbose mode)..."
    node "$SCRIPT_DIR/integrations/integrations-manager.js"
    ;;
  *)
    echo "Starting integrations manager in background..."
    nohup node "$SCRIPT_DIR/integrations/integrations-manager.js" > "$SCRIPT_DIR/logs/integrations.log" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"
    echo "✓ Started with PID $PID"
    echo "  View logs: tail -f logs/integrations.log"
    ;;
esac
