import type { PeerInfo } from '@ts-ethereum/kademlia'
import type { Address as UtilsAddress } from '@ts-ethereum/utils'
import { createAddressFromString } from '@ts-ethereum/utils'
import { schemaFromChainConfig } from '../builder'
import type { GenesisState } from '../defaults'
import {
  enodeToDPTPeerInfo,
  readBootnodeInfo,
  writeBootnodeInfo,
} from '../defaults/bootnodes'
import { Hardfork } from '../fork-params/enums'
import { GlobalConfig } from '../global'
import { initPrivateKey } from '../setup/keys'
import { getClientPaths } from '../setup/paths'
import type { ChainConfig } from '../types'
import {
  generateAccounts,
  getNodeAccount,
  readAccounts,
  writeAccounts,
} from './accounts'

export interface ClientInitArgs extends Partial<any> {
  /** Root data directory */
  dataDir?: string
  /** Network name */
  network?: string
  /** Node port */
  port?: number
  /** Chain configuration */
  chainConfig?: ChainConfig
  /** Genesis state */
  genesisState?: GenesisState
  /** Whether this is a bootnode */
  isBootnode?: boolean
  /** Whether this node is a miner */
  isMiner?: boolean
  /** Account seeds for deterministic account generation */
  accountSeeds?: string[]
  /** Bootnode port (default: 8000) */
  bootnodePort?: number
  /** Whether to persist network identity (default: true) */
  persistNetworkIdentity?: boolean
}

export interface ClientConfig {
  common: GlobalConfig
  datadir: string
  key: Uint8Array
  accounts: [address: UtilsAddress, privKey: Uint8Array][]
  bootnodes?: PeerInfo[]
}

/**
 * Initialize client configuration with all necessary setup
 * Similar to Lodestar's beaconHandlerInit pattern
 */
export async function initClientConfig(args: ClientInitArgs): Promise<any> {
  const network = args.network ?? process.env.NETWORK ?? 'testnet'
  const port = args.port ?? Number.parseInt(process.env.PORT || '8000', 10)
  const bootnodePort = args.bootnodePort ?? 8000
  const isBootnode = args.isBootnode ?? port === bootnodePort
  const isMiner = args.isMiner ?? false

  // Get paths
  const paths = getClientPaths(
    {
      dataDir: args.dataDir,
    },
    network,
  )

  // Initialize private key
  const persistNetworkIdentity =
    args.persistNetworkIdentity ??
    process.env.PERSIST_NETWORK_IDENTITY !== 'false'
  const { privateKey } = initPrivateKey(
    paths,
    args.logger,
    persistNetworkIdentity,
  )

  // Handle accounts
  let accounts: any[] = []
  const accountSeeds = args.accountSeeds ?? [
    'testnet-account-seed-0',
    'testnet-account-seed-1',
    'testnet-account-seed-2',
    'testnet-account-seed-3',
    'testnet-account-seed-4',
  ]

  if (isBootnode) {
    // Bootnode generates and saves accounts
    accounts = generateAccounts(accountSeeds)
    writeAccounts(paths.accountsFile, accounts)
  } else {
    // Other nodes read accounts from file
    accounts = readAccounts(paths.accountsFile)
    if (accounts.length === 0) {
      // Fallback: generate accounts if file doesn't exist
      accounts = generateAccounts(accountSeeds)
      writeAccounts(paths.accountsFile, accounts)
    }
  }

  const nodeAccount = getNodeAccount(accounts, port, bootnodePort)

  // Handle bootnode info
  let bootnodes: PeerInfo[] | undefined
  if (isBootnode) {
    // Write bootnode info
    writeBootnodeInfo(paths.bootnodeFile, port, privateKey)
  } else {
    // Read bootnode info and convert to DPT format
    const enodeUrl = readBootnodeInfo(paths.bootnodeFile)
    if (enodeUrl) {
      const peerInfo = enodeToDPTPeerInfo(enodeUrl)
      if (peerInfo) {
        bootnodes = [peerInfo]
      }
    }
  }

  // Create GlobalConfig instance
  const chainConfig = args.chainConfig
  if (!chainConfig) {
    throw new Error('chainConfig is required')
  }

  const schema = schemaFromChainConfig(chainConfig)
  const common = GlobalConfig.fromSchema({
    schema,
    hardfork: Hardfork.TangerineWhistle,
  })

  // Convert viem Address to utils Address for ConfigOptions
  const nodeAccountAddress = createAddressFromString(nodeAccount[0])

  // Merge with existing ConfigOptions
  const config = {
    common,
    datadir: paths.dataDir,
    key: privateKey,
    accounts: [[nodeAccountAddress, nodeAccount[1]]],
    bootnodes,
    minerCoinbase: nodeAccountAddress,
    mine: isMiner,
    port,
    extIP: args.extIP ?? process.env.EXT_IP ?? '127.0.0.1',
    syncmode: args.syncmode,
    vm: args.vm,
    prefixStorageTrieKeys: args.prefixStorageTrieKeys,
    useStringValueTrieDB: args.useStringValueTrieDB,
    saveReceipts: args.saveReceipts,
    txLookupLimit: args.txLookupLimit,
    logger: args.logger,
    maxPerRequest: args.maxPerRequest,
    maxFetcherJobs: args.maxFetcherJobs,
    maxFetcherRequests: args.maxFetcherRequests,
    minPeers: args.minPeers,
    maxPeers: args.maxPeers,
    execution: args.execution,
    numBlocksPerIteration: args.numBlocksPerIteration,
    accountCache: args.accountCache,
    storageCache: args.storageCache,
    codeCache: args.codeCache,
    trieCache: args.trieCache,
    debugCode: args.debugCode,
    discV4: args.discV4,
    isSingleNode: args.isSingleNode,
    vmProfileBlocks: args.vmProfileBlocks,
    vmProfileTxs: args.vmProfileTxs,
    safeReorgDistance: args.safeReorgDistance,
    syncedStateRemovalPeriod: args.syncedStateRemovalPeriod,
    savePreimages: args.savePreimages,
    prometheusMetrics: args.prometheusMetrics,
    useP2PServer: args.useP2PServer,
    node: args.node,
    metrics: args.metrics,
  }

  return config
}
