import { createBlockchain } from '@ts-ethereum/blockchain'
import {
  type ChainConfig,
  enodeToDPTPeerInfo,
  getNodeId,
  GlobalConfig,
  Hardfork,
  initPrivateKey,
  readAccounts,
  writeAccounts,
} from '@ts-ethereum/chain-config'
import { initDatabases } from '@ts-ethereum/db'
import {
  Config,
  createConfigOptions,
  ExecutionNode,
  getLogger,
  LevelDB,
  SyncMode,
} from '@ts-ethereum/execution-client'
import { defaultMetricsOptions } from '@ts-ethereum/metrics'
import {
  bytesToHex,
  createAddressFromPrivateKey,
  genPrivateKey,
  hexToBytes,
} from '@ts-ethereum/utils'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { GlobalArgs } from '../../options/globalOptions.js'
import type { NodeArgs } from './options.js'

// Shared config path for multi-node setups (mounted in Docker)
const SHARED_ACCOUNTS_PATH = '/shared/accounts.json'

export type NodeHandlerArgs = NodeArgs & GlobalArgs

function createTestChainConfig(chainId: number): ChainConfig {
  return {
    name: 'docker-testnet',
    chainId,
    defaultHardfork: 'chainstart',
    consensus: {
      type: 'pow',
      algorithm: 'ethash',
    },
    genesis: {
      gasLimit: 10485760,
      difficulty: 1,
      nonce: '0xbb00000000000000',
      extraData:
        '0xcc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    },
    hardforks: [{ name: 'chainstart', block: 0 }],
    bootstrapNodes: [],
  }
}

function createGenesisState(
  accounts: [string, Uint8Array][],
): Record<string, string> {
  const genesisState: Record<string, string> = {}
  const initialBalance = '0x3635c9adc5dea00000' // 1000 ETH

  for (const account of accounts) {
    genesisState[account[0]] = initialBalance
  }

  return genesisState
}

export async function nodeHandler(args: NodeHandlerArgs): Promise<void> {
  const {
    // Global
    dataDir,
    logLevel,

    // Network / P2P
    p2pPort,
    metricsPort,
    chainId,
    listenIp,
    announceIp,
    bootnode,
    discV4,
    minPeers,
    maxPeers,

    // Sync
    syncmode,
    safeReorgDistance,
    syncedStateRemovalPeriod,

    // Fetcher
    maxPerRequest,
    maxFetcherJobs,
    maxFetcherRequests,
    numBlocksPerIteration,

    // Mining
    mine,
    minerCoinbase,
    minerGasPrice,
    minerGasCeil,
    minerExtraData,

    // Execution
    execution,
    debugCode,
    isSingleNode,

    // Cache
    accountCache,
    storageCache,
    codeCache,
    trieCache,

    // Storage
    saveReceipts,
    txLookupLimit,
    prefixStorageTrieKeys,
    useStringValueTrieDB,
    savePreimages,

    // VM Profiler
    vmProfileBlocks,
    vmProfileTxs,

    // Metrics
    metricsEnabled,
    metricsAddress,
  } = args

  // For Docker: listen on 0.0.0.0 but advertise the actual IP
  // announceIp is what peers will use to connect to us
  const effectiveAnnounceIp = announceIp || listenIp

  const nodeLogger = getLogger({ logLevel: logLevel as any })

  // Ensure data directory exists and is writable
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  // Setup paths
  const peerIdFile = path.join(dataDir, 'peer-id.json')
  const accountsFile = path.join(dataDir, 'accounts.json')

  // Initialize or load private key (handles invalid formats gracefully)
  const { privateKey } = initPrivateKey({ peerIdFile }, nodeLogger, true)

  // Database paths (defined early so we can clear them if needed)
  const chainDbPath = path.join(dataDir, 'chain')
  const stateDbPath = path.join(dataDir, 'state')
  const metaDbPath = path.join(dataDir, 'meta')

  // Load or create accounts with shared config support for multi-node setups
  // Priority: 1. Local accounts.json 2. Shared accounts.json 3. Generate new
  let accounts: [string, Uint8Array][]
  let accountsRegenerated = false
  const sharedAccountsExists = existsSync(SHARED_ACCOUNTS_PATH)

  if (existsSync(accountsFile)) {
    // Local accounts exist - use them
    try {
      accounts = readAccounts(accountsFile)
      if (accounts.length === 0) {
        throw new Error('Empty accounts file')
      }
      nodeLogger?.info(`Loaded accounts from ${accountsFile}`)
    } catch (error) {
      nodeLogger?.warn(`Failed to read local accounts: ${error}`)
      // Try shared accounts as fallback
      if (sharedAccountsExists) {
        try {
          accounts = readAccounts(SHARED_ACCOUNTS_PATH)
          if (accounts.length > 0) {
            copyFileSync(SHARED_ACCOUNTS_PATH, accountsFile)
            nodeLogger?.info(
              `Copied accounts from shared config to ${accountsFile}`,
            )
          } else {
            throw new Error('Empty shared accounts')
          }
        } catch {
          throw new Error('Both local and shared accounts are invalid')
        }
      } else {
        // Generate new accounts
        const accountKey = genPrivateKey()
        const address = createAddressFromPrivateKey(accountKey)
        accounts = [[address.toString(), accountKey]]
        writeAccounts(accountsFile, accounts as any)
        accountsRegenerated = true
        nodeLogger?.info(`Generated new account: ${accountsFile}`)
      }
    }
  } else if (sharedAccountsExists) {
    // No local accounts but shared exists - copy from shared
    try {
      accounts = readAccounts(SHARED_ACCOUNTS_PATH)
      if (accounts.length === 0) {
        throw new Error('Empty shared accounts file')
      }
      copyFileSync(SHARED_ACCOUNTS_PATH, accountsFile)
      nodeLogger?.info(
        `Copied accounts from shared config: ${SHARED_ACCOUNTS_PATH}`,
      )
    } catch (error) {
      nodeLogger?.warn(
        `Failed to read shared accounts, generating new: ${error}`,
      )
      const accountKey = genPrivateKey()
      const address = createAddressFromPrivateKey(accountKey)
      accounts = [[address.toString(), accountKey]]
      writeAccounts(accountsFile, accounts as any)
      accountsRegenerated = true
    }
  } else {
    // No accounts anywhere - generate new and save to both local and shared
    const accountKey = genPrivateKey()
    const address = createAddressFromPrivateKey(accountKey)
    accounts = [[address.toString(), accountKey]]
    writeAccounts(accountsFile, accounts as any)
    nodeLogger?.info(`Generated new account: ${accountsFile}`)

    // Try to save to shared path for other nodes
    try {
      const sharedDir = path.dirname(SHARED_ACCOUNTS_PATH)
      if (existsSync(sharedDir)) {
        writeAccounts(SHARED_ACCOUNTS_PATH, accounts as any)
        nodeLogger?.info(
          `Saved accounts to shared config for other nodes: ${SHARED_ACCOUNTS_PATH}`,
        )
      }
    } catch (error) {
      nodeLogger?.debug(
        `Could not save to shared config (not in multi-node mode): ${error}`,
      )
    }
  }

  // If accounts were regenerated, genesis state will be different - clear old databases
  if (accountsRegenerated) {
    nodeLogger?.warn(
      'Accounts regenerated - clearing old databases to avoid genesis mismatch',
    )
    for (const dbPath of [chainDbPath, stateDbPath, metaDbPath]) {
      if (existsSync(dbPath)) {
        rmSync(dbPath, { recursive: true, force: true })
        nodeLogger?.info(`Cleared database: ${dbPath}`)
      }
    }
  }

  const account = accounts[0]

  // Create GlobalConfig
  const testChainConfig = createTestChainConfig(chainId)
  const common = new GlobalConfig({
    chain: testChainConfig,
    hardfork: Hardfork.Chainstart,
  })

  // Setup bootnodes
  let bootnodes: any[] = []
  if (bootnode) {
    const peerInfo = enodeToDPTPeerInfo(bootnode)
    if (peerInfo) {
      bootnodes = [peerInfo]
    }
  }

  // Parse miner options
  const parsedMinerGasPrice = minerGasPrice ? BigInt(minerGasPrice) : undefined
  const parsedMinerGasCeil = minerGasCeil ? BigInt(minerGasCeil) : undefined
  const parsedMinerExtraData = minerExtraData
    ? hexToBytes(minerExtraData as `0x${string}`)
    : undefined

  // Map syncmode string to SyncMode enum
  const syncModeValue = syncmode === 'none' ? SyncMode.None : SyncMode.Full

  // Create config with all options
  const configOptions = await createConfigOptions({
    common,
    logger: nodeLogger,
    datadir: dataDir,
    key: privateKey,
    accounts: [[account[0] as any, account[1]]],
    bootnodes,

    // Network
    port: p2pPort,
    extIP: listenIp, // Bind to this IP
    announceIP: effectiveAnnounceIp, // Advertise this IP to peers
    discV4,
    minPeers,
    maxPeers,

    // Sync
    syncmode: syncModeValue,
    safeReorgDistance,
    syncedStateRemovalPeriod,

    // Fetcher
    maxPerRequest,
    maxFetcherJobs,
    maxFetcherRequests,
    numBlocksPerIteration,

    // Mining
    mine,
    minerCoinbase: (minerCoinbase || account[0]) as any,
    minerGasPrice: parsedMinerGasPrice,
    minerGasCeil: parsedMinerGasCeil,
    minerExtraData: parsedMinerExtraData,

    // Execution
    execution,
    debugCode,
    isSingleNode,

    // Cache
    accountCache,
    storageCache,
    codeCache,
    trieCache,

    // Storage
    saveReceipts,
    txLookupLimit,
    prefixStorageTrieKeys,
    useStringValueTrieDB,
    savePreimages,

    // VM Profiler
    vmProfileBlocks,
    vmProfileTxs,

    // Metrics
    metrics: {
      ...defaultMetricsOptions,
      enabled: metricsEnabled,
      port: metricsPort,
      address: metricsAddress,
    },
  })

  const _bootnodes = configOptions.bootnodes ? [...configOptions.bootnodes] : []
  const _accounts = configOptions.accounts ? [...configOptions.accounts] : []
  const config = new Config({
    ...configOptions,
    bootnodes: _bootnodes,
    accounts: _accounts,
    minerPriorityAddresses: configOptions.minerPriorityAddresses
      ? [...configOptions.minerPriorityAddresses]
      : undefined,
  })

  // Setup databases
  const dbPaths = {
    chainDbPath,
    stateDbPath,
    metaDbPath,
  }

  const databases = await initDatabases(dbPaths, nodeLogger)
  const genesisState = createGenesisState(accounts)

  // Create blockchain
  const blockchain = await createBlockchain({
    db: new LevelDB(databases.chainDB),
    common,
    hardforkByHeadBlockNumber: true,
    validateBlocks: true,
    validateConsensus: true,
    genesisState: genesisState as any,
  })

  // Create and start node
  const node = await ExecutionNode.init({
    config,
    blockchain,
    genesisState: genesisState as any,
    chainDB: databases.chainDB,
    stateDB: databases.stateDB,
    metaDB: databases.metaDB,
  })

  const nodeId = getNodeId(privateKey)
  const enode = `enode://${bytesToHex(nodeId).slice(2)}@${effectiveAnnounceIp}:${p2pPort}`

  console.log('='.repeat(60))
  console.log('✅ Execution Client Node Started')
  console.log('='.repeat(60))
  console.log(`P2P Port:      ${p2pPort}`)
  console.log(`Listen IP:     ${listenIp}`)
  console.log(`Announce IP:   ${effectiveAnnounceIp}`)
  console.log(`Metrics:       http://${metricsAddress}:${metricsPort}/metrics`)
  console.log(`Enode:         ${enode}`)
  console.log(`Account:       ${account[0]}`)
  console.log(`Mining:        ${mine ? 'enabled' : 'disabled'}`)
  console.log(`Sync Mode:     ${syncmode}`)
  console.log(`Single Node:   ${isSingleNode}`)
  console.log(`Min Peers:     ${minPeers}`)
  console.log(`Max Peers:     ${maxPeers}`)
  console.log('='.repeat(60))

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down node...')
    await node.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Keep process alive
  await new Promise(() => {})
}
