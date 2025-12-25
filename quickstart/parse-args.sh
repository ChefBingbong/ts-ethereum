#!/bin/bash
# parse-args.sh - Parse command line arguments for setup.sh
# This file is sourced by setup.sh

# Default values
NETWORK=""
DATA_DIR=""
JUST_MINER=false
JUST_PEER=false
WITH_MONITORING=false
DETACHED=false
WITH_TERMINAL=""
DOCKER_WITH_SUDO=false
SKIP_IMAGE_PULL=false
HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --dataDir)
            DATA_DIR="$2"
            shift 2
            ;;
        --justMiner)
            JUST_MINER=true
            shift
            ;;
        --justPeer)
            JUST_PEER=true
            shift
            ;;
        --withMonitoring)
            WITH_MONITORING=true
            shift
            ;;
        --detached)
            DETACHED=true
            shift
            ;;
        --withTerminal)
            WITH_TERMINAL="$2"
            shift 2
            ;;
        --dockerWithSudo)
            DOCKER_WITH_SUDO=true
            shift
            ;;
        --skipImagePull)
            SKIP_IMAGE_PULL=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Export parsed values
export NETWORK
export DATA_DIR
export JUST_MINER
export JUST_PEER
export WITH_MONITORING
export DETACHED
export WITH_TERMINAL
export DOCKER_WITH_SUDO
export SKIP_IMAGE_PULL
export HELP

