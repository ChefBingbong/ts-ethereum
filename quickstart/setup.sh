#!/bin/bash
# setup.sh - Quick start script for Simple P2P Blockchain
# 
# Usage:
#   ./quickstart/setup.sh --network local-single
#   ./quickstart/setup.sh --network local-multi --withMonitoring --detached
#   ./quickstart/setup.sh --network local-multi --justPeer
#
# Based on lodestar-quickstart: https://github.com/ChainSafe/lodestar-quickstart

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse command line arguments
source "$SCRIPT_DIR/parse-args.sh" "$@"

# Show help
show_help() {
    cat << EOF
Simple P2P Blockchain - Quickstart Setup

USAGE:
    ./quickstart/setup.sh --network <network> [OPTIONS]

REQUIRED:
    --network <name>        Network configuration to use (e.g., local-single, local-multi)

OPTIONS:
    --dataDir <path>        Data directory for node(s) (overrides network default)
    --justMiner             Only start the miner node
    --justPeer              Only start the peer node (requires running miner)
    --withMonitoring        Also start Prometheus and Grafana
    --detached              Run containers in background
    --withTerminal <cmd>    Launch in separate terminals (e.g., "gnome-terminal --")
    --dockerWithSudo        Prefix docker commands with sudo
    --skipImagePull         Don't pull/build images
    --help, -h              Show this help message

EXAMPLES:
    # Single node, interactive
    ./quickstart/setup.sh --network local-single

    # Multi-node with monitoring, detached
    ./quickstart/setup.sh --network local-multi --withMonitoring --detached

    # Just the peer, connecting to existing miner
    ./quickstart/setup.sh --network local-multi --justPeer

    # With separate terminals (Linux with gnome-terminal)
    ./quickstart/setup.sh --network local-multi --withTerminal "gnome-terminal --"

AVAILABLE NETWORKS:
EOF
    for vars_file in "$SCRIPT_DIR"/*.vars; do
        if [[ -f "$vars_file" ]]; then
            name=$(basename "$vars_file" .vars)
            echo "    - $name"
        fi
    done
    echo ""
}

# Show help if requested
if [[ "$HELP" == "true" ]]; then
    show_help
    exit 0
fi

# Validate network argument
if [[ -z "$NETWORK" ]]; then
    log_error "Network is required. Use --network <name>"
    echo ""
    show_help
    exit 1
fi

# Load network configuration
NETWORK_FILE="$SCRIPT_DIR/${NETWORK}.vars"
if [[ ! -f "$NETWORK_FILE" ]]; then
    log_error "Network configuration not found: $NETWORK_FILE"
    echo "Available networks:"
    for vars_file in "$SCRIPT_DIR"/*.vars; do
        if [[ -f "$vars_file" ]]; then
            echo "  - $(basename "$vars_file" .vars)"
        fi
    done
    exit 1
fi

log_info "Loading network configuration: $NETWORK"
source "$NETWORK_FILE"

# Override data directory if provided
if [[ -n "$DATA_DIR" ]]; then
    log_info "Using custom data directory: $DATA_DIR"
fi

# Setup docker command
DOCKER_CMD="docker"
DOCKER_COMPOSE_CMD="docker-compose"
if [[ "$DOCKER_WITH_SUDO" == "true" ]]; then
    DOCKER_CMD="sudo docker"
    DOCKER_COMPOSE_CMD="sudo docker-compose"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Build/pull images
if [[ "$SKIP_IMAGE_PULL" != "true" ]]; then
    log_info "Building Docker image..."
    $DOCKER_COMPOSE_CMD build
fi

# Function to wait for miner and get enode
# Returns enode via stdout - all progress output goes to stderr
wait_for_enode() {
    local max_attempts=30
    local attempt=0
    local enode=""
    
    echo -e "${BLUE}[INFO]${NC} Waiting for miner to start and provide enode..." >&2
    
    while [[ -z "$enode" && $attempt -lt $max_attempts ]]; do
        sleep 2
        attempt=$((attempt + 1))
        enode=$($DOCKER_CMD logs miner 2>&1 | grep "Enode:" | awk '{print $2}' | tail -1)
        
        if [[ -n "$enode" ]]; then
            # Replace the IP with the miner's fixed IP
            enode=$(echo "$enode" | sed "s/@[^:]*:/@${MINER_IP:-172.20.0.10}:/")
            echo "" >&2  # Newline after dots
            echo "$enode"  # Only this goes to stdout
            return 0
        fi
        
        echo -n "." >&2  # Progress dots to stderr
    done
    
    echo "" >&2
    echo -e "${RED}[ERROR]${NC} Timeout waiting for miner enode" >&2
    return 1
}

# Function to start miner
start_miner() {
    log_info "Starting miner node..."
    
    local compose_args="-f docker-compose.yml"
    local run_args=""
    
    if [[ "$DETACHED" == "true" ]]; then
        run_args="-d"
    fi
    
    # Export environment variables for docker-compose
    export CHAIN_ID
    export LOG_LEVEL
    export MINER_IP
    export MINER_P2P_PORT
    export MINER_RPC_PORT
    export MINER_METRICS_PORT
    
    if [[ -n "$WITH_TERMINAL" ]]; then
        $WITH_TERMINAL $DOCKER_COMPOSE_CMD $compose_args up $run_args miner &
    else
        $DOCKER_COMPOSE_CMD $compose_args up $run_args miner
    fi
}

# Function to start peer
start_peer() {
    local enode="$1"
    
    if [[ -z "$enode" ]]; then
        log_error "Enode is required to start peer"
        return 1
    fi
    
    log_info "Starting peer node..."
    log_info "Connecting to: $enode"
    
    local compose_args="-f docker-compose.yml"
    local run_args=""
    
    if [[ "$DETACHED" == "true" ]]; then
        run_args="-d"
    fi
    
    # Export environment variables for docker-compose
    export CHAIN_ID
    export LOG_LEVEL
    export PEER_IP
    export PEER_P2P_PORT
    export PEER_RPC_PORT
    export PEER_METRICS_PORT
    export BOOTNODE_ENODE="$enode"
    
    if [[ -n "$WITH_TERMINAL" ]]; then
        $WITH_TERMINAL $DOCKER_COMPOSE_CMD $compose_args up $run_args peer &
    else
        $DOCKER_COMPOSE_CMD $compose_args up $run_args peer
    fi
}

# Function to start monitoring
start_monitoring() {
    log_info "Starting monitoring stack (Prometheus + Grafana)..."
    
    local compose_args="-f docker-compose.yml -f docker/docker-compose.monitoring.yml"
    local run_args="-d"  # Monitoring always runs detached
    
    # Export environment variables
    export GRAFANA_USER
    export GRAFANA_PASSWORD
    
    $DOCKER_COMPOSE_CMD $compose_args up $run_args prometheus grafana
    
    log_success "Monitoring started!"
    log_info "  Prometheus: http://localhost:${PROMETHEUS_PORT:-9090}"
    log_info "  Grafana:    http://localhost:${GRAFANA_PORT:-3000} (${GRAFANA_USER:-admin}/${GRAFANA_PASSWORD:-admin})"
}

# Function to show status
show_status() {
    echo ""
    echo "============================================================"
    log_success "Setup complete!"
    echo "============================================================"
    echo ""
    echo "Endpoints:"
    
    if [[ "$JUST_PEER" != "true" ]]; then
        echo "  Miner RPC:     http://localhost:${MINER_RPC_PORT:-9300}"
        echo "  Miner Metrics: http://localhost:${MINER_METRICS_PORT:-9400}/metrics"
    fi
    
    if [[ "$NETWORK" == "local-multi" && "$JUST_MINER" != "true" ]]; then
        echo "  Peer RPC:      http://localhost:${PEER_RPC_PORT:-9301}"
        echo "  Peer Metrics:  http://localhost:${PEER_METRICS_PORT:-9401}/metrics"
    fi
    
    if [[ "$WITH_MONITORING" == "true" ]]; then
        echo "  Prometheus:    http://localhost:${PROMETHEUS_PORT:-9090}"
        echo "  Grafana:       http://localhost:${GRAFANA_PORT:-3000}"
    fi
    
    echo ""
    echo "Useful commands:"
    echo "  View logs:     docker logs -f miner"
    echo "  Stop all:      docker-compose down"
    echo "  Clean data:    docker-compose down -v"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "============================================================"
    echo "Simple P2P Blockchain - Quickstart"
    echo "Network: $NETWORK_NAME"
    echo "============================================================"
    echo ""
    
    # Handle single-node mode
    if [[ "$NETWORK" == "local-single" ]]; then
        start_miner
        
        if [[ "$DETACHED" == "true" ]]; then
            sleep 5  # Wait for container to start
            show_status
        fi
        return
    fi
    
    # Handle multi-node mode
    if [[ "$JUST_PEER" == "true" ]]; then
        # User wants to start just the peer - assume miner is already running
        local enode=$(wait_for_enode)
        if [[ -z "$enode" ]]; then
            log_error "Could not get enode from miner. Is miner running?"
            log_info "Start miner first with: ./quickstart/setup.sh --network local-multi --justMiner"
            exit 1
        fi
        start_peer "$enode"
    elif [[ "$JUST_MINER" == "true" ]]; then
        # User wants to start just the miner
        start_miner
        
        if [[ "$DETACHED" == "true" ]]; then
            sleep 5
            local enode=$(wait_for_enode)
            echo ""
            log_success "Miner started!"
            log_info "Enode: $enode"
            log_info ""
            log_info "To start peer, run:"
            log_info "  ./quickstart/setup.sh --network local-multi --justPeer"
        fi
    else
        # Start both miner and peer
        
        # Start miner in background first
        log_info "Starting miner in background..."
        $DOCKER_COMPOSE_CMD -f docker-compose.yml up -d miner
        
        # Wait for enode
        local enode=$(wait_for_enode)
        if [[ -z "$enode" ]]; then
            log_error "Failed to get miner enode"
            exit 1
        fi
        
        log_success "Got miner enode: $enode"
        
        # Start peer
        export BOOTNODE_ENODE="$enode"
        
        if [[ "$DETACHED" == "true" ]]; then
            $DOCKER_COMPOSE_CMD -f docker-compose.yml up -d peer
        else
            if [[ -n "$WITH_TERMINAL" ]]; then
                $WITH_TERMINAL $DOCKER_COMPOSE_CMD -f docker-compose.yml up peer &
            else
                $DOCKER_COMPOSE_CMD -f docker-compose.yml up peer
            fi
        fi
    fi
    
    # Start monitoring if requested
    if [[ "$WITH_MONITORING" == "true" ]]; then
        start_monitoring
    fi
    
    # Show status if running detached
    if [[ "$DETACHED" == "true" ]]; then
        show_status
    fi
}

# Handle cleanup on exit
cleanup() {
    if [[ "$DETACHED" != "true" ]]; then
        log_info "Stopping containers..."
        $DOCKER_COMPOSE_CMD down
    fi
}

trap cleanup EXIT

# Run main
main

