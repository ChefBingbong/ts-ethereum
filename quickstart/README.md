# Quickstart Scripts

Easy setup scripts for running Simple P2P Blockchain nodes.

Based on [lodestar-quickstart](https://github.com/ChainSafe/lodestar-quickstart).

## Prerequisites

- Docker
- Docker Compose
- Bash shell

## Quick Start

```bash
# Single node (miner only)
./quickstart/setup.sh --network local-single

# Multi-node (miner + peer)
./quickstart/setup.sh --network local-multi

# Multi-node with monitoring (Prometheus + Grafana)
./quickstart/setup.sh --network local-multi --withMonitoring --detached
```

## Usage

```
./quickstart/setup.sh --network <network> [OPTIONS]

REQUIRED:
    --network <name>        Network configuration (local-single, local-multi)

OPTIONS:
    --dataDir <path>        Data directory for node(s)
    --justMiner             Only start the miner node
    --justPeer              Only start the peer node (requires running miner)
    --withMonitoring        Also start Prometheus and Grafana
    --detached              Run containers in background
    --withTerminal <cmd>    Launch in separate terminals
    --dockerWithSudo        Prefix docker commands with sudo
    --skipImagePull         Don't pull/build images
    --help, -h              Show help message
```

## Network Configurations

### local-single

Single miner node - good for development and testing.

```bash
./quickstart/setup.sh --network local-single
```

Endpoints:
- RPC: http://localhost:9300
- Metrics: http://localhost:9400/metrics

### local-multi

Multi-node setup with miner and peer on a Docker network.

```bash
./quickstart/setup.sh --network local-multi --detached
```

Endpoints:
- Miner RPC: http://localhost:9300
- Miner Metrics: http://localhost:9400/metrics
- Peer RPC: http://localhost:9301
- Peer Metrics: http://localhost:9401/metrics

## Configuration Reference

All configuration options from `packages/execution-client/src/config/utils.ts` (`ResolvedConfigOptions`) are supported through the `.vars` files and environment variables.

### Chain Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_ID` | `99999` | Blockchain chain ID |

### Sync Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNCMODE` | `full` | Synchronization mode (`full` or `none`) |
| `SAFE_REORG_DISTANCE` | `100` | Safe reorg distance for chain reorganizations |
| `SYNCED_STATE_REMOVAL_PERIOD` | `60000` | Period for synced state removal (ms) |

### Network / P2P Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `P2P_PORT` | `9000` | P2P listening port |
| `RPC_PORT` | `9300` | JSON-RPC API port |
| `METRICS_PORT` | `9400` | Prometheus metrics port |
| `LISTEN_IP` | `0.0.0.0` | IP address to bind/listen on |
| `ANNOUNCE_IP` | varies | IP address to advertise to peers |
| `DISC_V4` | `true` | Enable discv4 peer discovery |
| `MIN_PEERS` | `1` | Minimum number of peers |
| `MAX_PEERS` | `25` | Maximum number of peers |

### Fetcher Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PER_REQUEST` | `100` | Maximum items per request |
| `MAX_FETCHER_JOBS` | `100` | Maximum concurrent fetcher jobs |
| `MAX_FETCHER_REQUESTS` | `5` | Maximum concurrent fetcher requests |
| `NUM_BLOCKS_PER_ITERATION` | `100` | Number of blocks to process per iteration |

### Mining Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MINE` | `false` | Enable mining |
| `MINER_COINBASE` | (first account) | Address for mining rewards |
| `MINER_GAS_PRICE` | - | Gas price for mined transactions (wei) |
| `MINER_GAS_CEIL` | - | Gas ceiling for blocks |
| `MINER_EXTRA_DATA` | - | Extra data to include in mined blocks |

### Execution Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EXECUTION` | `true` | Enable block execution |
| `DEBUG_CODE` | `false` | Enable debug code in EVM |
| `IS_SINGLE_NODE` | `false` | Run as single node (no peer requirements) |

### Cache Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCOUNT_CACHE` | `400000` | Account cache size |
| `STORAGE_CACHE` | `200000` | Storage cache size |
| `CODE_CACHE` | `200000` | Code cache size |
| `TRIE_CACHE` | `200000` | Trie cache size |

### Storage Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SAVE_RECEIPTS` | `true` | Save transaction receipts |
| `TX_LOOKUP_LIMIT` | `2350000` | Transaction lookup limit (blocks) |
| `PREFIX_STORAGE_TRIE_KEYS` | `true` | Prefix storage trie keys |
| `USE_STRING_VALUE_TRIE_DB` | `false` | Use string values in trie DB |
| `SAVE_PREIMAGES` | `true` | Save preimages |

### VM Profiler Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VM_PROFILE_BLOCKS` | `false` | Enable VM profiling for blocks |
| `VM_PROFILE_TXS` | `false` | Enable VM profiling for transactions |

### Metrics Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_ENABLED` | `true` | Enable metrics server |
| `METRICS_ADDRESS` | `0.0.0.0` | Metrics server bind address |
| `METRICS_PATH` | `/metrics` | Metrics endpoint path |
| `METRICS_PREFIX` | `eth` | Metrics prefix |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity (`error`, `warn`, `info`, `debug`, `trace`) |

### Docker Configuration (multi-node only)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINER_IP` | `172.20.0.10` | Miner node IP (for Docker network) |
| `PEER_IP` | `172.20.0.11` | Peer node IP (for Docker network) |
| `DOCKER_NETWORK_SUBNET` | `172.20.0.0/16` | Docker network subnet |

### Monitoring Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMETHEUS_PORT` | `9090` | Prometheus web UI port |
| `GRAFANA_PORT` | `3000` | Grafana web UI port |
| `GRAFANA_USER` | `admin` | Grafana admin username |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

## Examples

### Development (interactive)

```bash
# Watch logs in terminal
./quickstart/setup.sh --network local-single
```

### Production (background)

```bash
# Run in background with monitoring
./quickstart/setup.sh --network local-multi --withMonitoring --detached

# View logs
docker logs -f miner
docker logs -f peer
```

### Start components separately

```bash
# Start miner first
./quickstart/setup.sh --network local-multi --justMiner --detached

# Later, start peer
./quickstart/setup.sh --network local-multi --justPeer --detached
```

### With separate terminals (Linux)

```bash
./quickstart/setup.sh --network local-multi --withTerminal "gnome-terminal --"
```

### With separate terminals (macOS)

```bash
./quickstart/setup.sh --network local-multi --withTerminal "osascript -e 'tell app \"Terminal\" to do script'"
```

## Configuration Files

### *.vars files

Each network has a `.vars` configuration file:

- `local-single.vars` - Single node configuration
- `local-multi.vars` - Multi-node configuration

You can create custom networks by adding new `.vars` files.

## Monitoring

When using `--withMonitoring`:

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## Commands Reference

### View logs
```bash
docker logs -f miner
docker logs -f peer
```

### Stop all containers
```bash
docker-compose down
```

### Remove all data
```bash
docker-compose down -v
```

### Check status
```bash
docker-compose ps
```

## Send Funds

After starting nodes, you can send test transactions:

```bash
# From project root
bun packages/execution-client/src/bin/send-funds.ts --from 0 --to 1 --amount 1
```

## CLI Reference

The node CLI supports all configuration options. Run `--help` to see all options:

```bash
bun packages/cli/bin/simple-p2p.ts node --help
```

This will show all options organized by category:
- Network (ports, IPs, peer discovery)
- Sync (mode, reorg distance)
- Fetcher (request limits)
- Mining (coinbase, gas settings)
- Execution (debug, single node mode)
- Cache (account, storage, code, trie)
- Storage (receipts, preimages)
- Profiler (VM profiling)
- Metrics (server settings)
