#!/bin/bash
# cleanup-now.sh — Remove containers e sessões BGP Lab órfãos imediatamente
echo "Containers clab ativos:"
docker ps --format '{{.Names}}' | grep clab

echo ""
echo "Removendo containers clab-*..."
docker ps -a --filter "name=clab-" --format "{{.ID}}" | xargs -r docker rm -f
echo "Removendo redes clab-*..."
docker network ls --filter "name=clab-" --format "{{.ID}}" | xargs -r docker network rm 2>/dev/null || true
echo "Removendo redes bgplab-*..."
docker network ls --filter "name=bgplab-" --format "{{.ID}}" | xargs -r docker network rm 2>/dev/null || true
echo "Removendo sessões em /opt/bgp-labs/..."
rm -rf /opt/bgp-labs/session-* 2>/dev/null || true
echo "Reiniciando backend..."
systemctl restart labnet-backend
echo ""
echo "Pronto. Containers restantes:"
docker ps --format '{{.Names}}' | grep clab || echo "(nenhum)"
