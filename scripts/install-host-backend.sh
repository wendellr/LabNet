#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/labnet}"
LAB_DIR="${LAB_HOST_BASE_DIR:-/opt/bgp-labs}"
SERVICE_FILE="/etc/systemd/system/labnet-backend.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo bash scripts/install-host-backend.sh"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale Node.js 20+ antes de continuar."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker nao encontrado."
  exit 1
fi

if ! command -v containerlab >/dev/null 2>&1; then
  echo "ContainerLab nao encontrado. Instalando..."
  bash -c "$(curl -sL https://get.containerlab.dev)"
fi

mkdir -p "$APP_DIR" "$LAB_DIR"
rsync -a --delete --exclude '.git' --exclude 'frontend/node_modules' --exclude 'frontend/dist' ./ "$APP_DIR/"

cd "$APP_DIR/backend"
npm ci --omit=dev

cat > "$APP_DIR/backend/.env" <<EOF
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-3000}
MAX_STUDENTS=${MAX_STUDENTS:-15}
MGMT_SUBNET_START=${MGMT_SUBNET_START:-200}
MGMT_SUBNET_POOL_SIZE=${MGMT_SUBNET_POOL_SIZE:-50}
LAB_BASE_DIR=${LAB_DIR}
LAB_HOST_BASE_DIR=${LAB_DIR}
FRR_IMAGE=${FRR_IMAGE:-quay.io/frrouting/frr:10.5.0}
TEACHER_PASSWORD=${TEACHER_PASSWORD:-bgp@teach2025}
TEACHER_EMAIL=${TEACHER_EMAIL:-}
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_FROM=${RESEND_FROM:-onboarding@resend.dev}
NODE_ENV=production
EOF

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=LabNet BGP Lab backend
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now labnet-backend

echo "Backend instalado e iniciado."
echo "Teste: curl -i http://127.0.0.1:${PORT:-3000}/api/health"
