#!/usr/bin/env bash
# ===========================================================================
# Wildcat AI Concierge — setup.sh
# Installs Node 18 (via nvm), Python 3.11 (from source if needed),
# project dependencies for frontend & backend, and creates the .env file.
# ===========================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION="18"
PYTHON_VERSION="3.11.9"

echo "========================================"
echo " Wildcat AI Concierge — Setup"
echo "========================================"

# --------------------------------------------------------------------------
# 1. Install Node.js 18 via nvm
# --------------------------------------------------------------------------
echo ""
echo "[1/4] Setting up Node.js $NODE_VERSION via nvm..."

export NVM_DIR="$HOME/.nvm"

if [ ! -d "$NVM_DIR" ]; then
    echo "  Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Source nvm
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! nvm ls "$NODE_VERSION" &>/dev/null; then
    echo "  Installing Node.js $NODE_VERSION..."
    nvm install "$NODE_VERSION"
else
    echo "  Node.js $NODE_VERSION already installed."
fi
nvm use "$NODE_VERSION"
echo "  Node: $(node --version)  npm: $(npm --version)"

# --------------------------------------------------------------------------
# 2. Install Python 3.11 (use system if >=3.9, otherwise build from source)
# --------------------------------------------------------------------------
echo ""
echo "[2/4] Setting up Python..."

PYTHON_CMD=""

# Check if a suitable python3 already exists
for candidate in python3.11 python3.10 python3.9 python3; do
    if command -v "$candidate" &>/dev/null; then
        ver=$("$candidate" --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 9 ]; then
            PYTHON_CMD="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "  No Python >=3.9 found. Installing Python $PYTHON_VERSION from source..."
    PYTHON_INSTALL_DIR="$PROJECT_DIR/.python/$PYTHON_VERSION"

    if [ ! -f "$PYTHON_INSTALL_DIR/bin/python3" ]; then
        # Install build dependencies (best-effort, may need sudo)
        if command -v dnf &>/dev/null; then
            echo "  Installing build dependencies (may prompt for sudo)..."
            sudo dnf install -y gcc openssl-devel bzip2-devel libffi-devel \
                zlib-devel readline-devel sqlite-devel xz-devel 2>/dev/null || true
        fi

        TMPDIR=$(mktemp -d)
        cd "$TMPDIR"
        echo "  Downloading Python $PYTHON_VERSION..."
        curl -sL "https://www.python.org/ftp/python/$PYTHON_VERSION/Python-$PYTHON_VERSION.tgz" | tar xz
        cd "Python-$PYTHON_VERSION"
        echo "  Configuring..."
        ./configure --prefix="$PYTHON_INSTALL_DIR" --enable-optimizations --with-ensurepip=install \
            > /dev/null 2>&1
        echo "  Building (this may take a few minutes)..."
        make -j"$(nproc)" > /dev/null 2>&1
        make install > /dev/null 2>&1
        cd "$PROJECT_DIR"
        rm -rf "$TMPDIR"
    fi

    PYTHON_CMD="$PYTHON_INSTALL_DIR/bin/python3"
    echo "  Python installed at: $PYTHON_CMD"
fi

echo "  Using: $($PYTHON_CMD --version)"

# Save python path for start.sh
echo "$PYTHON_CMD" > "$PROJECT_DIR/.python_path"

# --------------------------------------------------------------------------
# 3. Install frontend dependencies
# --------------------------------------------------------------------------
echo ""
echo "[3/4] Installing frontend dependencies..."
cd "$PROJECT_DIR/frontend"
npm install
echo "  Frontend dependencies installed."

# --------------------------------------------------------------------------
# 4. Install backend dependencies
# --------------------------------------------------------------------------
echo ""
echo "[4/4] Installing backend dependencies..."
cd "$PROJECT_DIR/backend"

# Create virtual environment
$PYTHON_CMD -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip > /dev/null 2>&1

# Install requirements
pip install -r requirements.txt

deactivate
echo "  Backend dependencies installed."

# --------------------------------------------------------------------------
# 5. Create .env file if not present
# --------------------------------------------------------------------------
if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo ""
    echo "  Creating backend .env (DEV_MODE=true, no AWS keys needed)..."
    cat > "$PROJECT_DIR/backend/.env" << 'EOF'
DEV_MODE=true
CHROMA_PERSIST_DIR=./data/chroma
CONFIDENCE_THRESHOLD=0.65
CORS_ORIGINS=http://localhost:3000
EOF
fi

echo ""
echo "========================================"
echo " Setup complete!"
echo " Run:  bash start.sh"
echo "========================================"
