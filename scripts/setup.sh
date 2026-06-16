#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  BGP Lab Platform — Script de Instalação                            ║
# ║  Ubuntu 24.04 / 26.04 — Docker CE já instalado e rodando            ║
# ║  Detecta IPv4 automaticamente — IPv6 also supported                ║
# ║  Nginx já em uso — HTTP:84  HTTPS:445                               ║
# ╚══════════════════════════════════════════════════════════════════════╝

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

echo ""
echo "  ██████╗  ██████╗ ██████╗     ██╗      █████╗ ██████╗ "
echo "  ██╔══██╗██╔════╝ ██╔══██╗    ██║     ██╔══██╗██╔══██╗"
echo "  ██████╔╝██║  ███╗██████╔╝    ██║     ███████║██████╔╝"
echo "  ██╔══██╗██║   ██║██╔═══╝     ██║     ██╔══██║██╔══██╗"
echo "  ██████╔╝╚██████╔╝██║         ███████╗██║  ██║██████╔╝"
echo "  ╚═════╝  ╚═════╝ ╚═╝         ╚══════╝╚═╝  ╚═╝╚═════╝ "
echo ""
info "BGP Lab Platform — Setup (Ubuntu 24.04/26.04, Nginx existente, HTTP:84, HTTPS:445)"
echo ""

# ── Verificar root ────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || error "Execute como root: sudo bash setup.sh"

# ── Variáveis ─────────────────────────────────────────────────────────
INSTALL_DIR=${INSTALL_DIR:-/opt/bgp-lab-platform}
LAB_DIR=/opt/bgp-labs
HTTP_PORT=84
HTTPS_PORT=445
# Detecta IPv4 público (tenta múltiplos serviços, ignora IPv6)
_get_ipv4() {
    local ip
    for svc in "https://api4.ipify.org" "https://ipv4.icanhazip.com" "https://checkip.amazonaws.com"; do
        ip=$(curl -4 -s --max-time 5 "$svc" 2>/dev/null | tr -d '[:space:]')
        # Valida que é IPv4 (não contém ':')
        if echo "$ip" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "$ip"; return
        fi
    done
    # Fallback: IP local da interface principal
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
    [ -n "$ip" ] && echo "$ip" || echo "localhost"
}
DOMAIN=${DOMAIN:-$(_get_ipv4)}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VHOST_FILE=/etc/nginx/sites-available/bgplab
VHOST_LINK=/etc/nginx/sites-enabled/bgplab
UBUNTU_VER=$(lsb_release -rs 2>/dev/null || echo "0")
UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "unknown")

info "Ubuntu $UBUNTU_VER ($UBUNTU_CODENAME) detectado"

# ── 1. Verificar Docker ───────────────────────────────────────────────
info "Verificando Docker..."
command -v docker &>/dev/null || error "Docker não encontrado. Instale docker-ce antes de continuar."
docker info &>/dev/null       || error "Docker daemon não está rodando. Execute: sudo systemctl start docker"
success "Docker $(docker --version | awk '{print $3}' | tr -d ',') — OK (não será modificado)"

# ── 2. Verificar Nginx ────────────────────────────────────────────────
info "Verificando Nginx..."
command -v nginx &>/dev/null          || error "Nginx não encontrado."
systemctl is-active nginx &>/dev/null || error "Nginx não está rodando. Execute: sudo systemctl start nginx"
[ -d /etc/nginx/sites-available ]     || error "Diretório sites-available não encontrado."
success "Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}') — OK (não será modificado)"

# ── 3. Dependências ───────────────────────────────────────────────────
info "Instalando dependências..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    curl wget git ca-certificates gnupg \
    tcpdump tshark net-tools iproute2 \
    jq openssl
success "Dependências instaladas"

# ── 4. Node.js 20 ─────────────────────────────────────────────────────
# Usa nvm para evitar problemas de compatibilidade com Ubuntu 26.04
# onde o nodesource ainda não tem suporte ao codename 'resolute'
info "Verificando Node.js..."
NODE_OK=false
if command -v node &>/dev/null; then
    NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
    [ "$NODE_VER" -ge 18 ] 2>/dev/null && NODE_OK=true
fi

if [ "$NODE_OK" = false ]; then
    info "Instalando Node.js 20 via nvm (compatível com Ubuntu 24/26)..."

    # Tenta nodesource primeiro (funciona no 24.04)
    NODESOURCE_OK=false
    if curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource.sh 2>/dev/null; then
        # Verifica se o codename é suportado
        if grep -q "$UBUNTU_CODENAME" /tmp/nodesource.sh 2>/dev/null || \
           bash /tmp/nodesource.sh 2>/dev/null; then
            apt-get install -y -qq nodejs 2>/dev/null && NODESOURCE_OK=true
        fi
    fi

    if [ "$NODESOURCE_OK" = false ]; then
        warn "nodesource não suporta Ubuntu $UBUNTU_VER ($UBUNTU_CODENAME) — usando nvm..."
        export NVM_DIR="/root/.nvm"
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        # Carrega nvm
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 20
        nvm use 20
        nvm alias default 20
        # Cria symlink para /usr/local/bin para que node/npm fiquem no PATH global
        NODE_PATH=$(nvm which 20)
        NPM_PATH=$(dirname "$NODE_PATH")/npm
        ln -sf "$NODE_PATH" /usr/local/bin/node 2>/dev/null || true
        ln -sf "$NPM_PATH"  /usr/local/bin/npm  2>/dev/null || true
        # Também no /usr/bin para o systemd
        ln -sf "$NODE_PATH" /usr/bin/node 2>/dev/null || true
        ln -sf "$NPM_PATH"  /usr/bin/npm  2>/dev/null || true
    fi
fi

NODE_BIN=$(command -v node || echo "/usr/local/bin/node")
success "Node.js $(node --version 2>/dev/null || $NODE_BIN --version)"

# ── 5. ContainerLab ───────────────────────────────────────────────────
info "Verificando ContainerLab..."
if ! command -v containerlab &>/dev/null; then
    info "Instalando ContainerLab..."
    bash -c "$(curl -sL https://get.containerlab.dev)"
fi
success "ContainerLab $(containerlab version 2>/dev/null | grep -i version | awk '{print $2}' | head -1)"

# ── 6. Pull imagem FRR ────────────────────────────────────────────────
info "Verificando imagem FRR..."
if ! docker image inspect frrouting/frr:latest &>/dev/null; then
    info "Baixando imagem FRR (pode demorar ~2 min)..."
    docker pull frrouting/frr:latest
else
    success "Imagem FRR já disponível localmente"
fi
success "frrouting/frr:latest — OK"

# ── 7. Limpeza de containers/labs anteriores ─────────────────────────
info "Limpando containers BGP Lab anteriores..."
CLEANED=0

# Para o backend anterior (libera sessões em memória)
if systemctl is-active bgplab-backend &>/dev/null; then
    info "Parando bgplab-backend..."
    systemctl stop bgplab-backend
fi

# Destrói topologias ContainerLab ativas (clab-* containers)
CLAB_CONTAINERS=$(docker ps -a --filter "name=clab-" --format "{{.Names}}" 2>/dev/null)
if [ -n "$CLAB_CONTAINERS" ]; then
    CLAB_COUNT=$(echo "$CLAB_CONTAINERS" | wc -l)
    warn "Encontrados $CLAB_COUNT containers ContainerLab ativos — removendo..."
    # Tenta destruir via containerlab (limpa topologia corretamente)
    for TOPO_DIR in "$LAB_DIR"/session-*/; do
        [ -f "$TOPO_DIR/topology.yml" ] &&             containerlab destroy -t "$TOPO_DIR/topology.yml" --cleanup 2>/dev/null || true
    done
    # Remove containers restantes que ainda estejam de pé
    docker ps -a --filter "name=clab-" --format "{{.ID}}" |         xargs -r docker rm -f 2>/dev/null || true
    # Remove redes docker do containerlab
    docker network ls --filter "name=clab-" --format "{{.ID}}" |         xargs -r docker network rm 2>/dev/null || true
    CLEANED=$CLAB_COUNT
    success "$CLEANED containers antigos removidos"
else
    success "Nenhum container BGP Lab encontrado"
fi

# Remove diretório de sessões antigas
if [ -d "$LAB_DIR" ]; then
    SESSION_COUNT=$(find "$LAB_DIR" -maxdepth 1 -name "session-*" -type d 2>/dev/null | wc -l)
    [ "$SESSION_COUNT" -gt 0 ] &&         rm -rf "$LAB_DIR"/session-* &&         info "$SESSION_COUNT diretórios de sessão antigos removidos"
fi

# ── 8. Copiar arquivos ────────────────────────────────────────────────
info "Copiando arquivos para $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR" "$LAB_DIR"
cp -r "$SCRIPT_DIR"/. "$INSTALL_DIR"/
chown -R root:root "$INSTALL_DIR"
success "Arquivos copiados"

# ── 9. Criar .env se não existir ─────────────────────────────────────
ENV_FILE="$INSTALL_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    info "Criando $ENV_FILE a partir do template..."
    cp "$INSTALL_DIR/backend/.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    success ".env criado — edite $ENV_FILE para configurar senha e email"
else
    success ".env já existe — mantendo configurações atuais"
fi

# ── 10. Build backend ─────────────────────────────────────────────────
info "Instalando dependências do backend..."
cd "$INSTALL_DIR/backend"
npm ci --omit=dev
success "Backend pronto"

# ── 10. Build frontend ─────────────────────────────────────────────────
info "Fazendo build do frontend..."
cd "$INSTALL_DIR/frontend"
npm ci
npm run build
success "Frontend compilado em dist/"

# ── 11. Serviço systemd ───────────────────────────────────────────────
info "Configurando serviço systemd..."

# Descobre o caminho correto do node
NODE_EXEC=$(command -v node 2>/dev/null || echo "/usr/local/bin/node")

cat > /etc/systemd/system/bgplab-backend.service << UNIT
[Unit]
Description=BGP Lab Platform Backend
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=-$INSTALL_DIR/backend/.env
Environment=PORT=3000
Environment=LAB_BASE_DIR=$LAB_DIR
Environment=NODE_ENV=production
Environment=PATH=/root/.nvm/versions/node/v20/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_EXEC server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bgplab

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable bgplab-backend
systemctl restart bgplab-backend
success "Serviço bgplab-backend iniciado na porta 3000"

# ── 12. Certificado SSL self-signed ───────────────────────────────────
mkdir -p /etc/nginx/ssl/bgplab
if [ ! -f /etc/nginx/ssl/bgplab/bgplab.crt ]; then
    info "Gerando certificado SSL self-signed..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/bgplab/bgplab.key \
        -out    /etc/nginx/ssl/bgplab/bgplab.crt \
        -subj   "/CN=$DOMAIN/O=BGPLab/C=BR" 2>/dev/null
    chmod 600 /etc/nginx/ssl/bgplab/bgplab.key
    success "Certificado gerado em /etc/nginx/ssl/bgplab/"
else
    success "Certificado SSL já existe — mantendo"
fi

# ── 13. Virtual host Nginx (não toca em nada existente) ───────────────
info "Criando virtual host em $VHOST_FILE..."

grep -r "listen ${HTTP_PORT}\b"  /etc/nginx/sites-enabled/ &>/dev/null \
    && warn "Porta $HTTP_PORT já em uso — pode haver conflito"
grep -r "listen ${HTTPS_PORT}\b" /etc/nginx/sites-enabled/ &>/dev/null \
    && warn "Porta $HTTPS_PORT já em uso — pode haver conflito"

FRONTEND_DIST="$INSTALL_DIR/frontend/dist"

# limit_req_zone deve ficar no contexto http{} — coloca em conf.d separado
LIMIT_CONF=/etc/nginx/conf.d/bgplab-limits.conf
cat > "$LIMIT_CONF" << 'LIMITEOF'
# BGP Lab Platform — rate limiting zones
limit_req_zone $binary_remote_addr zone=bgplab_api:10m  rate=30r/m;
limit_req_zone $binary_remote_addr zone=bgplab_exec:10m rate=60r/m;
LIMITEOF

cat > "$VHOST_FILE" << NGINXEOF
# BGP Lab Platform — gerado por setup.sh
# listen em 0.0.0.0 (IPv4) e [::]  (IPv6) explicitamente

# HTTP :$HTTP_PORT → redireciona para HTTPS :$HTTPS_PORT
server {
    listen 0.0.0.0:$HTTP_PORT;
    listen [::]:$HTTP_PORT;
    server_name _;
    return 301 https://\$host:$HTTPS_PORT\$request_uri;
}

# HTTPS :$HTTPS_PORT
server {
    listen 0.0.0.0:$HTTPS_PORT ssl;
    listen [::]:$HTTPS_PORT ssl;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/bgplab/bgplab.crt;
    ssl_certificate_key /etc/nginx/ssl/bgplab/bgplab.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # API REST
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

    # WebSocket (terminal xterm.js + notificações)
    location /ws {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ContainerLab Graph (proxy inline via backend)
    location /graph/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
    }

    # Frontend SPA
    location / {
        root      $FRONTEND_DIST;
        try_files \$uri \$uri/ /index.html;
        expires   1h;
    }
}
NGINXEOF

ln -sf "$VHOST_FILE" "$VHOST_LINK"

# ── Garante que nginx.conf inclui sites-enabled ───────────────────────────────
# Em alguns servidores o include foi removido ou nunca existiu
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    warn "nginx.conf não inclui sites-enabled — adicionando..."
    # Adiciona dentro do bloco http{}, antes do fechamento
    sed -i '/^\s*http\s*{/a\tinclude /etc/nginx/sites-enabled/*;
	include /etc/nginx/conf.d/*.conf;' /etc/nginx/nginx.conf
    success "include sites-enabled adicionado ao nginx.conf"
else
    success "nginx.conf já inclui sites-enabled"
fi

nginx -t || error "Erro no Nginx — verifique: sudo nginx -t"
systemctl reload nginx
success "Nginx recarregado — outros sites intactos"

# ── 14. Firewall ──────────────────────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    info "Abrindo portas no UFW..."
    ufw allow ${HTTP_PORT}/tcp  comment "BGP Lab HTTP"  2>/dev/null || true
    ufw allow ${HTTPS_PORT}/tcp comment "BGP Lab HTTPS" 2>/dev/null || true
    success "UFW: portas $HTTP_PORT e $HTTPS_PORT liberadas"
fi

# ── 15. Sudoers ───────────────────────────────────────────────────────
info "Configurando sudoers..."
cat > /etc/sudoers.d/bgplab << 'SUDOEOF'
root ALL=(ALL) NOPASSWD: /usr/bin/containerlab
root ALL=(ALL) NOPASSWD: /usr/local/bin/containerlab
root ALL=(ALL) NOPASSWD: /usr/bin/docker
SUDOEOF
chmod 440 /etc/sudoers.d/bgplab
success "sudoers configurado"

# ── 16. Verificação final ─────────────────────────────────────────────
info "Verificando serviços..."
sleep 3

BACKEND_OK="❌"
NGINX_OK="❌"
curl -s http://localhost:3000/api/health | grep -q '"ok":true' && BACKEND_OK="✅"
curl -4sk https://127.0.0.1:${HTTPS_PORT} -o /dev/null -w "%{http_code}" \
    | grep -q "200\|304" && NGINX_OK="✅"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        ✅  BGP Lab Platform instalado com sucesso!           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
printf "║  🌐 HTTP  → redireciona: http://%-28s║\n"  "$DOMAIN:$HTTP_PORT"
printf "║  🔒 HTTPS principal:     https://%-26s║\n" "$DOMAIN:$HTTPS_PORT"
printf "║  👨‍🏫 Senha professor:     %-30s  ║\n"     "bgp@teach2025"
printf "║  📁 Instalado em:        %-30s  ║\n"     "$INSTALL_DIR"
echo "║                                                              ║"
printf "║  Backend  :3000  %s                                      ║\n" "$BACKEND_OK"
printf "║  Nginx    :$HTTPS_PORT %s                                      ║\n" "$NGINX_OK"
echo "║                                                              ║"
echo "║  Logs:    sudo journalctl -u bgplab-backend -f              ║"
echo "║  Vhost:   /etc/nginx/sites-available/bgplab                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
warn "SSL self-signed — browser vai exibir aviso. Para produção:"
warn "  sudo certbot --nginx -d $DOMAIN"
warn ""
warn "Altere a senha do professor em:"
warn "  $INSTALL_DIR/frontend/src/components/SessionGate.jsx"
echo ""
