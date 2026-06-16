#!/bin/bash
# update.sh — Atualiza a plataforma sem reinstalar tudo
# Execute a partir do diretório do zip extraído:
#   cd /tmp && unzip -o bgp-lab-platform-full.zip
#   sudo bash bgp-platform/scripts/update.sh

set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Execute como root: sudo bash scripts/update.sh"; exit 1; }

INSTALL_DIR=${INSTALL_DIR:-/opt/bgp-lab-platform}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RESTART_BACKEND=false
REBUILD_FRONTEND=false

# ── Backend ───────────────────────────────────────────────────────────────────
if ! diff -q "$SCRIPT_DIR/backend/server.js" "$INSTALL_DIR/backend/server.js" &>/dev/null; then
    info "Atualizando server.js..."
    cp "$SCRIPT_DIR/backend/server.js" "$INSTALL_DIR/backend/"
    RESTART_BACKEND=true
fi

if ! diff -rq "$SCRIPT_DIR/backend/labs/" "$INSTALL_DIR/backend/labs/" &>/dev/null; then
    info "Atualizando labs/..."
    cp -r "$SCRIPT_DIR/backend/labs/." "$INSTALL_DIR/backend/labs/"
    RESTART_BACKEND=true
fi

if ! diff -q "$SCRIPT_DIR/backend/labs-data.js" "$INSTALL_DIR/backend/labs-data.js" &>/dev/null; then
    info "Atualizando labs-data.js..."
    cp "$SCRIPT_DIR/backend/labs-data.js" "$INSTALL_DIR/backend/"
    RESTART_BACKEND=true
fi

# Verifica se há novas dependências npm
if ! diff -q "$SCRIPT_DIR/backend/package.json" "$INSTALL_DIR/backend/package.json" &>/dev/null; then
    info "Novas dependências backend — executando npm install..."
    cp "$SCRIPT_DIR/backend/package.json" "$INSTALL_DIR/backend/"
    cp "$SCRIPT_DIR/backend/package-lock.json" "$INSTALL_DIR/backend/" 2>/dev/null || true
    cd "$INSTALL_DIR/backend" && npm install --omit=dev
    RESTART_BACKEND=true
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
# Compara os assets (js/css) — se mudaram, copia o dist
SRC_HASH=$(find "$SCRIPT_DIR/frontend/dist/assets" -type f | sort | xargs md5sum 2>/dev/null | md5sum | cut -d' ' -f1)
DST_HASH=$(find "$INSTALL_DIR/frontend/dist/assets" -type f | sort | xargs md5sum 2>/dev/null | md5sum | cut -d' ' -f1)

if [ "$SRC_HASH" != "$DST_HASH" ]; then
    info "Atualizando frontend dist/..."
    cp -r "$SCRIPT_DIR/frontend/dist/." "$INSTALL_DIR/frontend/dist/"
    REBUILD_FRONTEND=true
fi

# ── Aplica mudanças ───────────────────────────────────────────────────────────
if [ "$RESTART_BACKEND" = true ]; then
    info "Reiniciando backend..."
    systemctl restart bgplab-backend
    sleep 2
    systemctl is-active bgplab-backend &>/dev/null && success "Backend reiniciado" || echo "WARN: verifique com journalctl -u bgplab-backend"
fi

if [ "$REBUILD_FRONTEND" = true ]; then
    success "Frontend atualizado — faça Ctrl+Shift+R no browser"
fi

if [ "$RESTART_BACKEND" = false ] && [ "$REBUILD_FRONTEND" = false ]; then
    success "Nada mudou — plataforma já está atualizada"
fi

echo ""
success "Update concluído"
