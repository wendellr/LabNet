#!/bin/bash
# patch-ws.sh — Corrige URL WebSocket e window.Terminal sem reinstalar
# Execute no servidor: sudo bash patch-ws.sh
set -e
INSTALL_DIR=${INSTALL_DIR:-/opt/bgp-lab-platform}
HOOKS="$INSTALL_DIR/frontend/src/hooks/index.js"
LAB="$INSTALL_DIR/frontend/src/components/StudentLab.jsx"

echo "[1/4] Corrigindo hooks/index.js ..."
python3 - "$HOOKS" << 'PY'
import sys, re
f = sys.argv[1]
with open(f) as fh: c = fh.read()

old = '''    const base = API_BASE.replace(/^http/, "ws") || `ws://${window.location.host}`;
    const ws = new WebSocket(base);'''

new = '''    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = API_BASE
      ? API_BASE.replace(/^https?/, wsProto.slice(0,-1)) + "/ws"
      : `${wsProto}//${window.location.host}/ws`;
    const ws = new WebSocket(base);'''

if old in c:
    c = c.replace(old, new, 1)
    with open(f, 'w') as fh: fh.write(c)
    print("  hooks/index.js: CORRIGIDO")
elif 'wsProto' in c:
    print("  hooks/index.js: já estava correto")
else:
    print("  hooks/index.js: PADRÃO NÃO ENCONTRADO — verificar manualmente")
    print("  Conteúdo atual da linha WebSocket:")
    for i,l in enumerate(c.splitlines()):
        if 'WebSocket(base)' in l or 'location.host' in l:
            print(f"    {i+1}: {l}")
PY

echo "[2/4] Corrigindo window.Terminal em StudentLab.jsx ..."
python3 - "$LAB" << 'PY'
import sys
f = sys.argv[1]
with open(f) as fh: c = fh.read()

fixes = 0
# Fix: window.Terminal({ → window.Terminal.Terminal({
if 'new window.Terminal({' in c:
    c = c.replace('new window.Terminal({', 'new window.Terminal.Terminal({', 1)
    fixes += 1
    print("  Terminal constructor: CORRIGIDO")
elif 'new window.Terminal.Terminal({' in c:
    print("  Terminal constructor: já estava correto")
else:
    print("  Terminal constructor: não encontrado")

with open(f, 'w') as fh: fh.write(c)
PY

echo "[3/4] Rebuild frontend ..."
cd "$INSTALL_DIR/frontend"
npm run build 2>&1 | tail -6

echo "[4/4] Reiniciando backend ..."
systemctl restart bgplab-backend
sleep 2
systemctl is-active bgplab-backend &>/dev/null && echo "  Backend: OK" || echo "  Backend: FALHOU"

echo ""
echo "✅ Patch aplicado. Abra o browser com Ctrl+Shift+R (hard refresh)."
