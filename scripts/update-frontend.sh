#!/bin/bash
# update-frontend.sh — Atualiza frontend + rebuild sem reinstalar tudo
# Execute: sudo bash scripts/update-frontend.sh
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Execute como root: sudo bash update-frontend.sh"; exit 1; }

INSTALL_DIR=${INSTALL_DIR:-/opt/bgp-lab-platform}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

info "Copiando arquivos atualizados..."
cp -r "$SCRIPT_DIR/frontend/src"        "$INSTALL_DIR/frontend/"
cp -r "$SCRIPT_DIR/frontend/index.html" "$INSTALL_DIR/frontend/"
cp -r "$SCRIPT_DIR/backend/server.js"   "$INSTALL_DIR/backend/"

info "Rebuild do frontend..."
cd "$INSTALL_DIR/frontend"
npm run build

info "Reiniciando backend..."
systemctl restart bgplab-backend
sleep 2

systemctl is-active bgplab-backend &>/dev/null && success "Backend OK" || echo "WARN: backend não iniciou"
success "Frontend atualizado em $INSTALL_DIR/frontend/dist"
echo ""
echo "Teste: curl -4sk https://127.0.0.1:445 -o /dev/null -w '%{http_code}'"
