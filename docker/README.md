# Docker Configuration

This directory contains Docker configuration files for monitoring and supporting services.

## Directory Structure

```
docker/
├── docker-compose.monitoring.yml  # Prometheus + Grafana overlay
├── genesis/
│   └── accounts.json             # Genesis accounts for blockchain
├── grafana/
│   ├── Dockerfile
│   ├── dashboard.yml
│   ├── dashboards/
│   │   └── execution-client.json
│   └── datasource.yml
├── prometheus/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── prometheus.yml
└── README.md
```

## Quick Start

**Use the quickstart script in the project root:**

```bash
# Single node (miner only)
./quickstart/setup.sh --network local-single

# Multi-node with monitoring
./quickstart/setup.sh --network local-multi --withMonitoring --detached
```

## Manual Usage

### Start Blockchain Only

From project root:

```bash
# Build and start miner
docker-compose up -d miner

# Get enode from logs
docker logs miner | grep "Enode:"

# Start peer with enode
BOOTNODE_ENODE="enode://...@172.20.0.10:9000" docker-compose up -d peer
```

### Add Monitoring

```bash
# Start with monitoring overlay
docker-compose -f docker-compose.yml -f docker/docker-compose.monitoring.yml up -d
```

## Services

| Service | Port | URL |
|---------|------|-----|
| Miner RPC | 9300 | http://localhost:9300 |
| Miner Metrics | 9400 | http://localhost:9400/metrics |
| Peer RPC | 9301 | http://localhost:9301 |
| Peer Metrics | 9401 | http://localhost:9401/metrics |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3000 | http://localhost:3000 |

## Genesis Accounts

The `genesis/accounts.json` file contains pre-funded accounts for the blockchain:

```json
[
  {
    "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "privateKey": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "role": "miner"
  },
  {
    "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "privateKey": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "role": "user"
  }
]
```

These are well-known Hardhat/Foundry test accounts - **DO NOT use in production!**

## Grafana

Default credentials: `admin` / `admin`

Pre-configured dashboards are available in `grafana/dashboards/`.

## Troubleshooting

### View logs
```bash
docker logs -f miner
docker logs -f peer
```

### Restart services
```bash
docker-compose restart
```

### Clean up everything
```bash
docker-compose down -v
```

### Check container health
```bash
docker-compose ps
```
