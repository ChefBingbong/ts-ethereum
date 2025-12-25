#!/bin/bash
# Script to start local monitoring (Prometheus + Grafana) for a non-dockerized node
# Usage: ./docker-compose.local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if .env file exists, create from example if not
if [ ! -f .env ]; then
  echo "Creating .env file from template..."
  cat > .env << EOF
# Execution Client Configuration
P2P_PORT=9000
RPC_PORT=9300
METRICS_PORT=9400
CHAIN_ID=99999
LOG_LEVEL=info
MINE=false
MINER_COINBASE=
BOOTNODE=
EXT_IP=127.0.0.1

# Grafana Configuration
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
GRAFANA_ROOT_URL=http://localhost:3000

# Data Directory (inside container)
DATA_DIR=/data

# For local monitoring (non-dockerized node)
EXECUTION_CLIENT_URL=host.docker.internal:9400
EOF
  echo ".env file created. Please review and adjust as needed."
fi

# Start only Prometheus and Grafana
docker-compose up -d prometheus grafana

echo ""
echo "✅ Monitoring services started!"
echo ""
echo "Prometheus: http://localhost:9090"
echo "Grafana:    http://localhost:3000 (admin/admin)"
echo ""
echo "Make sure your execution client is running and exposing metrics on port 9400"
echo "To stop: docker-compose down"

