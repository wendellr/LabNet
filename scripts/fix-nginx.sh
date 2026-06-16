#!/bin/bash
# ────────────────────────────────────────────────────────────────
# fix-nginx.sh — Corrige 3 problemas do vhost BGP Lab Platform:
#   1. limit_req_zone dentro de server{} → move para conf.d
#   2. listen sem 0.0.0.0 → corrige para IPv4+IPv6 explícito
#   3. Detecta IP IPv4 real e exibe URL correta
# Execute: sudo bash scripts/fix-nginx.sh
# ────────────────────────────────────────────────────────────────
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
error()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

[ "$(id -u)" -eq 0 ] || error "Execute como root: sudo bash fix-nginx.sh"

INSTALL_DIR=${INSTALL_DIR:-/opt/bgp-lab-platform}
FRONTEND_DIST="$INSTALL_DIR/frontend/dist"
VHOST_FILE=/etc/nginx/sites-available/bgplab
VHOST_LINK=/etc/nginx/sites-enabled/bgplab
LIMIT_CONF=/etc/nginx/conf.d/bgplab-limits.conf
HTTP_PORT=84
HTTPS_PORT=445

# ── Detecta IPv4 público ──────────────────────────────────────
info "Detectando IPv4 público..."
IPV4=""
for svc in "https://api4.ipify.org" "https://ipv4.icanhazip.com" "https://checkip.amazonaws.com"; do
    ip=$(curl -4 -s --max-time 5 "$svc" 2>/dev/null | tr -d '[:space:]')
    if echo "$ip" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        IPV4="$ip"; break
    fi
done
if [ -z "$IPV4" ]; then
    IPV4=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || echo "localhost")
fi
success "IP IPv4: $IPV4"

# ── Fix 1: limit_req_zone → conf.d/bgplab-limits.conf ────────
info "Criando /etc/nginx/conf.d/bgplab-limits.conf..."
cat > "$LIMIT_CONF" << 'LIMITEOF'
# BGP Lab Platform — rate limiting (gerado por fix-nginx.sh)
limit_req_zone $binary_remote_addr zone=bgplab_api:10m  rate=30r/m;
limit_req_zone $binary_remote_addr zone=bgplab_exec:10m rate=60r/m;
LIMITEOF
success "Zones criadas em conf.d"

# ── Fix 2: Reescreve vhost com listen correto ─────────────────
info "Reescrevendo $VHOST_FILE..."

[ -f "$VHOST_FILE" ] && cp "$VHOST_FILE" "${VHOST_FILE}.bak"

cat > "$VHOST_FILE" << NGINXEOF
# BGP Lab Platform — corrigido por fix-nginx.sh
# IPv4 (0.0.0.0) + IPv6 ([::]) nas portas $HTTP_PORT e $HTTPS_PORT

server {
    listen 0.0.0.0:$HTTP_PORT;
    listen [::]:$HTTP_PORT;
    server_name _;
    return 301 https://\$host:$HTTPS_PORT\$request_uri;
}

server {
    listen 0.0.0.0:$HTTPS_PORT ssl;
    listen [::]:$HTTPS_PORT ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/bgplab/bgplab.crt;
    ssl_certificate_key /etc/nginx/ssl/bgplab/bgplab.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location /api/ {
        limit_req zone=bgplab_api burst=20 nodelay;
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /ws {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        root      $FRONTEND_DIST;
        try_files \$uri \$uri/ /index.html;
        expires   1h;
    }
}
NGINXEOF

ln -sf "$VHOST_FILE" "$VHOST_LINK"

# ── Garante que nginx.conf inclui sites-enabled ───────────────────
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    warn "nginx.conf não inclui sites-enabled — adicionando..."
    sed -i '/http {/a\tinclude /etc/nginx/sites-enabled/*;\n\tinclude /etc/nginx/conf.d/*.conf;' /etc/nginx/nginx.conf
    success "include adicionado ao nginx.conf"
fi

success "Vhost reescrito"

# ── Valida e recarrega ────────────────────────────────────────
info "Testando configuração do Nginx..."
nginx -t || error "Nginx -t falhou. Veja acima o erro. Backup em ${VHOST_FILE}.bak"

info "Recarregando Nginx..."
systemctl reload nginx
success "Nginx recarregado"

# ── Verificação ───────────────────────────────────────────────
sleep 2
NGINX_OK="❌"
curl -4sk "https://127.0.0.1:${HTTPS_PORT}" -o /dev/null -w "%{http_code}" \
    | grep -q "200\|304" && NGINX_OK="✅"

BACKEND_OK="❌"
curl -s "http://127.0.0.1:3000/api/health" | grep -q '"ok":true' && BACKEND_OK="✅"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  fix-nginx.sh — Resultado                                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Backend  :3000  %s                                      ║\n" "$BACKEND_OK"
printf "║  Nginx    :$HTTPS_PORT  %s                                      ║\n" "$NGINX_OK"
echo "║                                                              ║"
printf "║  🌐 HTTP:  http://%-40s║\n"  "$IPV4:$HTTP_PORT"
printf "║  🔒 HTTPS: https://%-39s║\n" "$IPV4:$HTTPS_PORT"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
