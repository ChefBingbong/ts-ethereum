import type { PeerInfo } from '@ts-ethereum/kademlia'
import type { Address as UtilsAddress } from '@ts-ethereum/utils'
import { createAddressFromString } from '@ts-ethereum/utils'
import { createHardforkManager, HardforkEntry } from 'src/config/functional'
import { schemaFromChainConfig } from '../builder'
import { GlobalConfig } from '../config'
import type { GenesisState } from '../genesis/types'
import type { ChainConfig } from '../types'
import {
  generateAccounts,
  getNodeAccount,
  readAccounts,
  writeAccounts,
} from './accounts'
import {
  enodeToDPTPeerInfo,
  readBootnodeInfo,
  writeBootnodeInfo,
} from './bootnodes'
import { initPrivateKey } from './keys'
import { getClientPaths } from './paths'

export interface ClientInitArgs extends Partial<any> {
  dataDir?: string
  network?: string
  port?: number
  chainConfig?: ChainConfig
  genesisState?: GenesisState
  isBootnode?: boolean
  isMiner?: boolean
  accountSeeds?: string[]
  bootnodePort?: number
  persistNetworkIdentity?: boolean
}

export interface ClientConfig {
  common: GlobalConfig
  datadir: string
  key: Uint8Array
  accounts: [address: UtilsAddress, privKey: Uint8Array][]
  bootnodes?: PeerInfo[]
}

export async function initClientConfig(args: ClientInitArgs): Promise<any> {
  const network = args.network ?? process.env.NETWORK ?? 'testnet'
  const port = args.port ?? Number.parseInt(process.env.PORT || '8000', 10)
  const bootnodePort = args.bootnodePort ?? 8000
  const isBootnode = args.isBootnode ?? port === bootnodePort
  const isMiner = args.isMiner ?? false

  const paths = getClientPaths(
    {
      dataDir: args.dataDir,
    },
    network,
  )

  const persistNetworkIdentity =
    args.persistNetworkIdentity ??
    process.env.PERSIST_NETWORK_IDENTITY !== 'false'
  const { privateKey } = initPrivateKey(
    paths,
    args.logger,
    persistNetworkIdentity,
  )

  let accounts: any[] = []
  const accountSeeds = args.accountSeeds ?? [
    'testnet-account-seed-0',
    'testnet-account-seed-1',
    'testnet-account-seed-2',
    'testnet-account-seed-3',
    'testnet-account-seed-4',
  ]

  if (isBootnode) {
    accounts = generateAccounts(accountSeeds)
    writeAccounts(paths.accountsFile, accounts)
  } else {
    accounts = readAccounts(paths.accountsFile)
    if (accounts.length === 0) {
      accounts = generateAccounts(accountSeeds)
      writeAccounts(paths.accountsFile, accounts)
    }
  }

  const nodeAccount = getNodeAccount(accounts, port, bootnodePort)

  let bootnodes: PeerInfo[] | undefined
  if (isBootnode) {
    writeBootnodeInfo(paths.bootnodeFile, port, privateKey)
  } else {
    const enodeUrl = readBootnodeInfo(paths.bootnodeFile)
    if (enodeUrl) {
      const peerInfo = enodeToDPTPeerInfo(enodeUrl)
      if (peerInfo) {
        bootnodes = [peerInfo]
      }
    }
  }

  const chainConfig = args.chainConfig
  if (!chainConfig) {
    throw new Error('chainConfig is required')
  }

  const schema = schemaFromChainConfig(chainConfig)
  const common = GlobalConfig.fromSchema({
    schema,
    hardfork: chainConfig.defaultHardfork,
  })

  const hardforkManager = createHardforkManager({
    hardforks: chainConfig.hardforks.map(
      (hf) =>
        ({
          block: hf.block,
          timestamp: hf.timestamp,
          forkHash: hf.forkHash,
          optional: hf.optional,
          name: hf.name,
        }) as HardforkEntry,
    ),
    chainId: BigInt(chainConfig.chainId),
    chain: chainConfig,
  })

  const nodeAccountAddress = createAddressFromString(nodeAccount[0])

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
    hardforkManager,
  }

  return config
}
