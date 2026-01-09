#!/usr/bin/env node

/**
 * Holesky Testnet Execution Client
 *
 * This script runs the execution client on the Holesky testnet (post-merge PoS).
 * It requires a consensus client (e.g., Lodestar) for block production.
 *
 * Usage:
 *   bun run src/bin/run-holesky.ts [options]
 *
 * Example with Lodestar:
 *   # Terminal 1: Start execution client
 *   bun run src/bin/run-holesky.ts
 *
 *   # Terminal 2: Start Lodestar
 *   lodestar beacon --network holesky \
 *     --execution.urls http://localhost:8551 \
 *     --jwt-secret ~/.ethereum-holesky/jwt.hex \
 *     --checkpointSyncUrl https://beaconstate-holesky.chainsafe.io
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { createBlockchainManager } from '@ts-ethereum/blockchain'
import {
  type ChainConfig,
  createHardforkManagerFromConfig,
  getGenesis,
  getPresetChainConfig,
} from '@ts-ethereum/chain-config'
import { initDatabases } from '@ts-ethereum/db'
import { bytesToHex, genPrivateKey } from '@ts-ethereum/utils'

import { Config, createConfigOptions, SyncMode } from '../config/index'
import { LevelDB } from '../execution/level'
import { getLogger, type Logger } from '../logging'
import { ExecutionNode } from '../node/index'

// ============================================================================
// Configuration - Holesky Network
// ============================================================================

const NETWORK_NAME = 'holesky'
const CHAIN_ID = 17000
const DEFAULT_PORT = 30303
const DEFAULT_DATA_DIR = `${homedir()}/.ethereum-holesky`
const DEFAULT_ENGINE_PORT = 8551
const DEFAULT_RPC_PORT = 8545
const DEFAULT_LOG_LEVEL = 'info'

// Updated - chainsafe URL is currently down, using beaconstate.info
const CHECKPOINT_SYNC_URL = 'https://holesky.beaconstate.info'

interface HoleskyConfig {
  port: number
  dataDir: string
  enginePort: number
  rpcPort: number
  jwtSecretPath: string
  logLevel: string
  cleanStart: boolean
  disableEngineAuth: boolean
}

function parseArgs(): HoleskyConfig {
  const args = process.argv.slice(2)
  const config: HoleskyConfig = {
    port: Number(process.env.PORT) || DEFAULT_PORT,
    dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
    enginePort: Number(process.env.ENGINE_PORT) || DEFAULT_ENGINE_PORT,
    rpcPort: Number(process.env.RPC_PORT) || DEFAULT_RPC_PORT,
    jwtSecretPath: '',
    logLevel: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
    cleanStart: false,
    disableEngineAuth: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--port':
        config.port = Number(args[++i])
        break
      case '--datadir':
      case '--data-dir':
        config.dataDir = args[++i]
        break
      case '--engine-port':
      case '--rpcEnginePort':
        config.enginePort = Number(args[++i])
        break
      case '--rpc-port':
      case '--rpcPort':
        config.rpcPort = Number(args[++i])
        break
      case '--jwt-secret':
      case '--jwtSecret':
        config.jwtSecretPath = args[++i]
        break
      case '--log-level':
      case '--loglevel':
        config.logLevel = args[++i]
        break
      case '--clean':
        config.cleanStart = true
        break
      case '--no-auth':
      case '--rpcEngineAuth=false':
        config.disableEngineAuth = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  // Default JWT secret path
  if (!config.jwtSecretPath) {
    config.jwtSecretPath = `${config.dataDir}/jwt.hex`
  }

  return config
}

function printHelp(): void {
  console.log(`
Holesky Testnet Execution Client

Usage: bun run src/bin/run-holesky.ts [options]

Options:
  --port <number>         P2P listening port (default: 30303)
  --datadir <path>        Data directory (default: ~/.ethereum-holesky)
  --engine-port <number>  Engine API port (default: 8551)
  --rpc-port <number>     JSON-RPC port (default: 8545)
  --jwt-secret <path>     Path to JWT secret file
  --log-level <level>     Log level: debug, info, warn, error (default: info)
  --clean                 Clean data directory before starting
  --no-auth               Disable JWT auth (NOT recommended, dev only)
  --help, -h              Show this help message

Example:
  # Start execution client
  bun run src/bin/run-holesky.ts --datadir ./holesky-data

  # Start Lodestar consensus client (separate terminal)
  lodestar beacon --network holesky \\
    --execution.urls http://localhost:8551 \\
    --jwt-secret ./holesky-data/jwt.hex \\
    --checkpointSyncUrl ${CHECKPOINT_SYNC_URL}
`)
}

// ============================================================================
// Main
// ============================================================================

function cleanDataDir(dataDir: string): void {
  if (existsSync(dataDir)) {
    console.log(`🧹 Cleaning data directory: ${dataDir}`)
    rmSync(dataDir, { recursive: true, force: true })
  }
}

async function startHoleskyClient(config: HoleskyConfig) {
  const logger: Logger | undefined = getLogger({ logLevel: config.logLevel })

  // Get Holesky chain configuration
  const chainConfig = getPresetChainConfig(NETWORK_NAME) as ChainConfig
  if (!chainConfig) {
    throw new Error('Failed to load Holesky chain configuration')
  }

  // Get Holesky genesis state
  const genesisState = getGenesis(CHAIN_ID)
  if (!genesisState) {
    throw new Error('Failed to load Holesky genesis state')
  }

  logger?.info('='.repeat(60))
  logger?.info('Starting Holesky Execution Client')
  logger?.info('='.repeat(60))
  logger?.info(`Network: Holesky (chain ID: ${CHAIN_ID})`)
  logger?.info(`Data directory: ${config.dataDir}`)
  logger?.info(`P2P port: ${config.port}`)
  logger?.info(`Engine API port: ${config.enginePort}`)
  logger?.info(`JSON-RPC port: ${config.rpcPort}`)
  logger?.info(`JWT secret: ${config.jwtSecretPath}`)
  logger?.info('='.repeat(60))

  if (config.cleanStart) {
    cleanDataDir(config.dataDir)
  }

  // Ensure data directory exists
  mkdirSync(config.dataDir, { recursive: true })

  // Create paths for databases
  const dbPaths = {
    chainDbPath: `${config.dataDir}/chain`,
    stateDbPath: `${config.dataDir}/state`,
    metaDbPath: `${config.dataDir}/meta`,
  }

  // Initialize databases
  const databases = await initDatabases(dbPaths, logger)

  // Create hardfork manager from chain config
  const hardforkManager = createHardforkManagerFromConfig(chainConfig)

  // Generate or load private key
  const privateKey = genPrivateKey()

  // Create client config
  const clientConfig = await createConfigOptions({
    hardforkManager,
    datadir: config.dataDir,
    key: privateKey,
    port: config.port,
    extIP: '127.0.0.1',

    // Sync mode - beacon sync for post-merge
    syncmode: SyncMode.Beacon,
    execution: true,

    // Engine API configuration
    rpcEngine: true,
    rpcEnginePort: config.enginePort,
    rpcEngineAddr: '127.0.0.1',
    jwtSecret: config.jwtSecretPath,
    rpcEngineAuth: !config.disableEngineAuth,

    // Performance settings
    maxPeers: 50,
    minPeers: 1,

    // Storage settings
    saveReceipts: true,
    savePreimages: false,

    // Logging
    logger,

    // Accounts (none for non-mining node)
    accounts: [],
  })

  // Create Config instance
  const nodeConfig = new Config({
    hardforkManager,
    datadir: config.dataDir,
    key: privateKey,
    port: config.port,
    extIP: '127.0.0.1',
    syncmode: SyncMode.Beacon,
    execution: true,
    rpcEngine: true,
    rpcEnginePort: config.enginePort,
    rpcEngineAddr: '127.0.0.1',
    jwtSecret: config.jwtSecretPath,
    rpcEngineAuth: !config.disableEngineAuth,
    maxPeers: 50,
    minPeers: 1,
    saveReceipts: true,
    savePreimages: false,
    logger,
    accounts: [],
  })

  // Create blockchain manager
  const blockchain = await createBlockchainManager({
    db: new LevelDB(databases.chainDB),
    hardforkManager,
    hardforkByHeadBlockNumber: true,
    validateBlocks: true,
    validateConsensus: false, // Consensus validated by beacon chain
    genesisState: genesisState as any,
  })

  logger?.info(
    `Genesis block hash: ${bytesToHex(blockchain.genesisBlock.hash())}`,
  )

  // Initialize execution node
  const node = await ExecutionNode.init({
    config: nodeConfig,
    blockchain,
    genesisState: genesisState as any,
    chainDB: databases.chainDB,
    stateDB: databases.stateDB,
    metaDB: databases.metaDB,
  })

  // Print startup info
  console.log('\n' + '='.repeat(70))
  console.log('✅ Holesky Execution Client Started!')
  console.log('='.repeat(70))
  console.log(`
📡 Connection Info:
   P2P Port:       ${config.port}
   Engine API:     http://127.0.0.1:${config.enginePort}
   JSON-RPC:       http://127.0.0.1:${config.rpcPort}
   JWT Secret:     ${config.jwtSecretPath}

🔗 To connect Lodestar consensus client:
   lodestar beacon --network holesky \\
     --execution.urls http://localhost:${config.enginePort} \\
     --jwt-secret ${config.jwtSecretPath} \\
     --checkpointSyncUrl ${CHECKPOINT_SYNC_URL}

📊 Status:
   Chain ID:       ${CHAIN_ID} (Holesky)
   Genesis Hash:   ${bytesToHex(blockchain.genesisBlock.hash()).slice(0, 18)}...
   Sync Mode:      Beacon Sync (post-merge)
`)
  console.log('='.repeat(70) + '\n')

  return { node }
}

const stopClient = async (
  clientStartPromise: Promise<{ node: ExecutionNode } | null>,
) => {
  console.info(
    '\nCaught interrupt signal. Obtaining node handle for clean shutdown...',
  )

  const timeoutHandle: NodeJS.Timeout | undefined = setTimeout(() => {
    console.warn('Node has become unresponsive while starting up.')
    console.warn('Check logging output for potential errors. Exiting...')
    process.exit(1)
  }, 30000)

  const nodeHandle = await clientStartPromise
  if (nodeHandle !== null) {
    console.info('Shutting down the node and the servers...')
    await nodeHandle.node.stop()
    console.info('Exiting.')
  } else {
    console.info('Node did not start properly, exiting...')
  }

  if (timeoutHandle) clearTimeout(timeoutHandle)
  process.exit()
}

async function run() {
  const config = parseArgs()

  const nodeStartPromise = startHoleskyClient(config).catch((e) => {
    console.error('Error starting Holesky client:', e)
    return null
  })

  process.on('SIGINT', async () => {
    await stopClient(nodeStartPromise)
  })

  process.on('SIGTERM', async () => {
    await stopClient(nodeStartPromise)
  })

  process.on('uncaughtException', (err) => {
    console.error(`Uncaught error: ${err.message}`)
    console.error(err)
    void stopClient(nodeStartPromise)
  })
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
