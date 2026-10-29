#!/usr/bin/env bash
# Run the stepfun mini knowledge-base server on Linux (WSL2 / native / Docker).
# Handles: Node >= 20 detection, seekdb native-bindings preload
# (glibc static-TLS workaround) and a user-space libaio if present.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Node.js >= 20 ---------------------------------------------------------
if [ -n "${NODE_BIN:-}" ]; then
  :
elif command -v node >/dev/null 2>&1 && [ "$(node -e 'process.exit(process.versions.node.split(".")[0] >= 20 ? 0 : 1)' && echo ok)" = "ok" ]; then
  NODE_BIN=node
elif [ -x "$HOME/node-v22.9.0-linux-x64/bin/node" ]; then
  NODE_BIN="$HOME/node-v22.9.0-linux-x64/bin/node"
else
  echo "ERROR: Node.js >= 20 required. Set NODE_BIN=/path/to/node" >&2
  exit 1
fi

# --- seekdb native bindings (glibc static-TLS workaround) -------------------
SEEKDB_CACHE="$HOME/.seekdb/bindings"
warmup_bindings() {
  if [ -d "$SCRIPT_DIR/node_modules/@seekdb/js-bindings" ]; then
    "$NODE_BIN" -e 'require("@seekdb/js-bindings").getNativeBindingAsync().then(() => console.log("[stepfun] bindings ready")).catch((e) => { console.error(e); process.exit(1); })' \
      || { echo "ERROR: failed to fetch seekdb bindings (check network / SEEKDB_BINDINGS_BASE_URL)" >&2; exit 1; }
  fi
}
if [ -n "${SEEKDB_LIB:-}" ]; then
  LIB="$SEEKDB_LIB"
elif [ -f "$SEEKDB_CACHE"/*/linux-x64/libseekdb.so ]; then
  LIB=$(ls "$SEEKDB_CACHE"/*/linux-x64/libseekdb.so | head -1)
else
  echo "[stepfun] bindings not cached yet — downloading (first run only)..."
  warmup_bindings
  LIB=$(ls "$SEEKDB_CACHE"/*/linux-x64/libseekdb.so | head -1)
fi

# --- libaio (user-space install supported via SYS_LIBAIO_DIR) ---------------
LD_PATH=""
if [ -n "${SYS_LIBAIO_DIR:-}" ]; then
  LD_PATH="$SYS_LIBAIO_DIR"
elif [ -d "$HOME/syslibs/usr/lib/x86_64-linux-gnu" ]; then
  LD_PATH="$HOME/syslibs/usr/lib/x86_64-linux-gnu"
fi
[ -n "$LD_PATH" ] && export LD_LIBRARY_PATH="$LD_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LD_PRELOAD="$LIB${LD_PRELOAD:+:$LD_PRELOAD}"

# --- env --------------------------------------------------------------------
export PORT="${PORT:-8787}"
export SEEKDB_DATA_DIR="${SEEKDB_DATA_DIR:-$SCRIPT_DIR/data}"
export SEEKDB_MODELS_DIR="${SEEKDB_MODELS_DIR:-$SCRIPT_DIR/../../models}"

ulimit -s unlimited 2>/dev/null || true
ulimit -n 65535 2>/dev/null || true

echo "[stepfun] node: $("$NODE_BIN" --version)  data: $SEEKDB_DATA_DIR  port: $PORT"
cd "$SCRIPT_DIR/.."
exec "$NODE_BIN" src/server.js
