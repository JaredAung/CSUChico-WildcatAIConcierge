#!/usr/bin/env bash
# ===========================================================================
# Wildcat AI Concierge — start.sh
# Launches the backend (FastAPI on port 8001) and frontend (Next.js on 3000).
# ===========================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo " Wildcat AI Concierge — Starting"
echo "========================================"

# --------------------------------------------------------------------------
# Load nvm and use correct Node version
# --------------------------------------------------------------------------
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 18 2>/dev/null || true

# --------------------------------------------------------------------------
# Determine Python command
# --------------------------------------------------------------------------
if [ -f "$PROJECT_DIR/.python_path" ]; then
    PYTHON_CMD="$(cat "$PROJECT_DIR/.python_path")"
else
    PYTHON_CMD="python3"
fi

# --------------------------------------------------------------------------
# Kill any existing processes on our ports
# --------------------------------------------------------------------------
echo ""
echo "Checking for existing processes on ports 3000 and 8001..."
for port in 3000 8001; do
    pid=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "  Killing existing process on port $port (PID $pid)"
        kill "$pid" 2>/dev/null || true
        sleep 1
    fi
done

# --------------------------------------------------------------------------
# Start Backend (FastAPI + uvicorn on port 8001)
# --------------------------------------------------------------------------
echo ""
echo "Starting backend on http://localhost:8001 ..."
cd "$PROJECT_DIR/backend"
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload \
    > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
deactivate
echo "  Backend PID: $BACKEND_PID (log: backend.log)"

# --------------------------------------------------------------------------
# Start Frontend (Next.js dev server on port 3000)
# --------------------------------------------------------------------------
echo ""
echo "Starting frontend on http://localhost:3000 ..."
cd "$PROJECT_DIR/frontend"
nohup npm run dev > "$PROJECT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID (log: frontend.log)"

# --------------------------------------------------------------------------
# Wait for services to come up
# --------------------------------------------------------------------------
echo ""
echo "Waiting for services..."

# Wait for backend
for i in $(seq 1 30); do
    if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
        echo "  ✓ Backend is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ⚠ Backend did not respond within 30s — check backend.log"
    fi
    sleep 1
done

# Wait for frontend
for i in $(seq 1 30); do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        echo "  ✓ Frontend is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ⚠ Frontend did not respond within 30s — check frontend.log"
    fi
    sleep 1
done

# --------------------------------------------------------------------------
# Done
# --------------------------------------------------------------------------
echo ""
echo "========================================"
echo " Wildcat AI Concierge is running!"
echo ""
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8001"
echo "   API Docs:  http://localhost:8001/docs"
echo ""
echo " Logs:"
echo "   tail -f $PROJECT_DIR/frontend.log"
echo "   tail -f $PROJECT_DIR/backend.log"
echo ""
echo " To stop:  kill $FRONTEND_PID $BACKEND_PID"
echo "========================================"

# Save PIDs for easy cleanup
echo "$BACKEND_PID" > "$PROJECT_DIR/.backend.pid"
echo "$FRONTEND_PID" > "$PROJECT_DIR/.frontend.pid"
