#!/usr/bin/env node

/**
 * Hoodi Testnet Execution Client
 *
 * This script runs the execution client on the Hoodi testnet (post-merge PoS).
 * It requires a consensus client (e.g., Lodestar) for block production.
 *
 * Usage:
 *   bun run src/bin/run-hoodi.ts [options]
 *
 * Example with Lodestar:
 *   # Terminal 1: Start execution client
 *   bun run src/bin/run-hoodi.ts
 *
 *   # Terminal 2: Start Lodestar
 *   lodestar beacon --network hoodi \
 *     --execution.urls http://localhost:8551 \
 *     --jwt-secret ~/.ethereum-hoodi/jwt.hex \
 *     --checkpointSyncUrl https://beaconstate-hoodi.chainsafe.io
 */

import { createBlockchainManager } from '@ts-ethereum/blockchain'
import {
  type ChainConfig,
  createHardforkManagerFromConfig,
  getGenesis,
  getPresetChainConfig,
} from '@ts-ethereum/chain-config'
import { initDatabases } from '@ts-ethereum/db'
import { bytesToHex, genPrivateKey, hexToBytes } from '@ts-ethereum/utils'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'

import { Config, createConfigOptions, SyncMode } from '../config/index'
import { LevelDB } from '../execution/level'
import { getLogger, type Logger } from '../logging'
import { ExecutionNode } from '../node/index'

// ============================================================================
// Configuration - Hoodi Network
// ============================================================================

const NETWORK_NAME = 'hoodi'
const CHAIN_ID = 560048
const DEFAULT_PORT = 30301
const DEFAULT_DATA_DIR = `${homedir()}/.ethereum-hoodi`
const DEFAULT_ENGINE_PORT = 8551
const DEFAULT_RPC_PORT = 8545
const DEFAULT_LOG_LEVEL = 'info'

// From lodestar-quickstart hoodi.vars
const CHECKPOINT_SYNC_URL = 'https://beaconstate-hoodi.chainsafe.io'

// Hoodi bootnodes from official chain config
// These are the static bootnodes for peer discovery
const HOODI_BOOTNODES = [
  // bootnode 1
  'enode://2112dd3839dd752813d4df7f40936f06829fc54c0e051a93967c26e5f5d27d99d886b57b4ffcc3c475e930ec9e79c56ef1dbb7d86ca5ee83a9d2ccf36e5c240c@134.209.138.84:30303',
  // bootnode 2
  'enode://60203fcb3524e07c5df60a14ae1c9c5b24023ea5d47463dfae051d2c9f3219f309657537576090ca0ae641f73d419f53d8e8000d7a464319d4784acd7d2abc41@209.38.124.160:30303',
  // bootnode 3
  'enode://8ae4a48101b2299597341263da0deb47cc38aa4d3ef4b7430b897d49bfa10eb1ccfe1655679b1ed46928ef177fbf21b86837bd724400196c508427a6f41602cd@134.199.184.23:30303',
]

// Parse enode URL to DPT peer info
function parseEnodeToPeerInfo(enodeUrl: string) {
  const match = enodeUrl.match(/^enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)$/)
  if (!match) return null
  const [, nodeIdHex, ip, port] = match
  const nodeId = hexToBytes(`0x${nodeIdHex}`)
  const tcpPort = Number.parseInt(port, 10)
  return { id: nodeId, address: ip, tcpPort, udpPort: tcpPort }
}

interface HoodiConfig {
  port: number
  dataDir: string
  enginePort: number
  rpcPort: number
  jwtSecretPath: string
  logLevel: string
  cleanStart: boolean
  disableEngineAuth: boolean
}

function parseArgs(): HoodiConfig {
  const args = process.argv.slice(2)
  const config: HoodiConfig = {
    port: Number(process.env.PORT) || DEFAULT_PORT,
    dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
    enginePort: Number(process.env.ENGINE_PORT) || DEFAULT_ENGINE_PORT,
    rpcPort: Number(process.env.RPC_PORT) || DEFAULT_RPC_PORT,
    jwtSecretPath: '',
    logLevel: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
    cleanStart: false,
    disableEngineAuth: true,
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
    config.jwtSecretPath = `${config.dataDir}`
  }

  return config
}

function printHelp(): void {
  console.log(`
Hoodi Testnet Execution Client

Usage: bun run src/bin/run-hoodi.ts [options]

Options:
  --port <number>         P2P listening port (default: 30303)
  --datadir <path>        Data directory (default: ~/.ethereum-hoodi)
  --engine-port <number>  Engine API port (default: 8551)
  --rpc-port <number>     JSON-RPC port (default: 8545)
  --jwt-secret <path>     Path to JWT secret file
  --log-level <level>     Log level: debug, info, warn, error (default: info)
  --clean                 Clean data directory before starting
  --no-auth               Disable JWT auth (NOT recommended, dev only)
  --help, -h              Show this help message

Example:
  # Start execution client
  bun run src/bin/run-hoodi.ts --datadir ./hoodi-data

  # Start Lodestar consensus client (separate terminal)
  lodestar beacon --network hoodi \\
    --execution.urls http://localhost:8551 \\
    --jwt-secret ./hoodi-data/jwt.hex \\
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

async function startHoodiClient(config: HoodiConfig) {
  const logger: Logger | undefined = getLogger({ logLevel: config.logLevel })

  // Get Hoodi chain configuration
  const chainConfig = getPresetChainConfig(NETWORK_NAME) as ChainConfig
  if (!chainConfig) {
    throw new Error('Failed to load Hoodi chain configuration')
  }

  // Get Hoodi genesis state
  const genesisState = getGenesis(CHAIN_ID)
  if (!genesisState) {
    throw new Error('Failed to load Hoodi genesis state')
  }

  logger?.info('='.repeat(60))
  logger?.info('Starting Hoodi Execution Client')
  logger?.info('='.repeat(60))
  logger?.info(`Network: Hoodi (chain ID: ${CHAIN_ID})`)
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
    syncmode: SyncMode.Full,
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

  // Parse bootnodes from enode URLs
  const bootnodes = HOODI_BOOTNODES.map(parseEnodeToPeerInfo).filter(
    (b): b is NonNullable<ReturnType<typeof parseEnodeToPeerInfo>> =>
      b !== null,
  )
  logger?.info(`Parsed ${bootnodes.length} bootnodes for peer discovery`)

  // Create Config instance
  const nodeConfig = new Config({
    hardforkManager,
    datadir: config.dataDir,
    key: privateKey,
    port: config.port,
    extIP: '127.0.0.1',
    syncmode: SyncMode.Full,
    bootnodes,
    enableSnapSync: false,
    execution: true,
    rpcEngine: true,
    rpcEnginePort: config.enginePort,
    rpcEngineAddr: '127.0.0.1',
    jwtSecret: config.jwtSecretPath,
    rpcEngineAuth: false,
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
  console.log('✅ Hoodi Execution Client Started!')
  console.log('='.repeat(70))
  console.log(`
📡 Connection Info:
   P2P Port:       ${config.port}
   Engine API:     http://127.0.0.1:${config.enginePort}
   JSON-RPC:       http://127.0.0.1:${config.rpcPort}
   JWT Secret:     ${config.jwtSecretPath}

🔗 To connect Lodestar consensus client:
   lodestar beacon --network hoodi \\
     --execution.urls http://localhost:${config.enginePort} \\
     --jwt-secret ${config.jwtSecretPath} \\
     --checkpointSyncUrl ${CHECKPOINT_SYNC_URL}

📊 Status:
   Chain ID:       ${CHAIN_ID} (Hoodi)
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

  const nodeStartPromise = startHoodiClient(config).catch((e) => {
    console.error('Error starting Hoodi client:', e)
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
