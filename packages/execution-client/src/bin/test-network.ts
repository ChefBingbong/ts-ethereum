#!/usr/bin/env node

import { createBlockchain } from '@ts-ethereum/blockchain'
import type { ChainConfig } from '@ts-ethereum/chain-config'
import {
  getClientPaths,
  initClientConfig,
  readAccounts,
} from '@ts-ethereum/chain-config'
import { getDbPaths, initDatabases } from '@ts-ethereum/db'
import debug from 'debug'
import { existsSync, rmSync } from 'fs'
import { Config, createConfigOptions } from '../config/index'
import { LevelDB } from '../execution/level'
import { getLogger, type Logger } from '../logging'
import { ExecutionNode } from '../node/index'

debug.enable('p2p:*')

const BOOTNODE_PORT = 8000
const SHARED_DIR = '../../test-network-data'

const ACCOUNT_SEEDS = [
  'testnet-account-seed-0',
  'testnet-account-seed-1',
  'testnet-account-seed-2',
  'testnet-account-seed-3',
  'testnet-account-seed-4',
]

// Simplified chain config - only Chainstart/Frontier hardfork with PoW
export const customChainConfig: ChainConfig = {
  name: 'testnet',
  chainId: 12345,
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
      '0xcc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  },
  hardforks: [{ name: 'chainstart', block: 0 }],
  bootstrapNodes: [],
}

function createGenesisState(
  accounts: [address: string, privateKey: Uint8Array][],
): Record<string, string> {
  const genesisState: Record<string, string> = {}
  const initialBalance = '0x3635c9adc5dea00000' // 1000 ETH in hex

  for (const account of accounts) {
    genesisState[account[0].toString()] = initialBalance
  }

  console.log(
    `\n💰 Genesis state: ${accounts.length} accounts prefunded with 1000 ETH each\n`,
  )
  return genesisState
}

function cleanDataDir(dataDir: string): void {
  if (existsSync(dataDir)) {
    console.log(`🧹 Cleaning data directory: ${dataDir}`)
    rmSync(dataDir, { recursive: true, force: true })
  }
}

async function startClient() {
  const port = Number.parseInt(process.env.PORT || '8000', 10)
  const cleanStart = process.env.CLEAN === 'true'
  const isMiner = [8002, 8001].includes(port)
  const isBootnode = port === BOOTNODE_PORT
  const nodeLogger: Logger | undefined = getLogger()

  const _clientConfig = await initClientConfig({
    dataDir: process.env.DATA_DIR || `${SHARED_DIR}/node-${port}`,
    network: 'testnet',
    port,
    chainConfig: customChainConfig,
    isBootnode,
    isMiner,
    bootnodePort: BOOTNODE_PORT,
    accountSeeds: ACCOUNT_SEEDS,
    logger: nodeLogger,
    persistNetworkIdentity: true,
  })

  const clientConfig = await createConfigOptions(_clientConfig)
  if (cleanStart) cleanDataDir(clientConfig.datadir)

  const paths = getClientPaths({ dataDir: clientConfig.datadir }, 'testnet')
  const allAccounts = readAccounts(paths.accountsFile, ACCOUNT_SEEDS)

  const dbPaths = getDbPaths(paths)
  const databases = await initDatabases(dbPaths, nodeLogger)
  const genesisState = createGenesisState(allAccounts)

  const config = new Config({
    ..._clientConfig,
  })

  const blockchain = await createBlockchain({
    db: new LevelDB(databases.chainDB),
    common: clientConfig.common,
    hardforkByHeadBlockNumber: true,
    validateBlocks: true,
    validateConsensus: true,
    genesisState: genesisState as any,
  })

  const node = await ExecutionNode.init({
    config,
    blockchain,
    genesisState: genesisState as any,
    chainDB: databases.chainDB,
    stateDB: databases.stateDB,
    metaDB: databases.metaDB,
  })

  console.log('\n' + '='.repeat(60))
  console.log('✅ Node started successfully!')
  console.log(`   P2P port:  ${port}`)
  console.log(`   RPC URL:   http://127.0.0.1:${port + 300}`)
  console.log(`   Account:   ${clientConfig.accounts[0][0]}`)
  console.log(`   Enode:     enode://${clientConfig.key}@127.0.0.1:${port}`)
  console.log('='.repeat(60) + '\n')

  return { client: node }
}

const stopClient = async (
  clientStartPromise: Promise<{ client: ExecutionNode } | null>,
) => {
  console.info(
    '\nCaught interrupt signal. Obtaining node handle for clean shutdown...',
  )
  console.info(
    '(This might take a little longer if node not yet fully started)',
  )

  let timeoutHandle: NodeJS.Timeout | undefined
  if (clientStartPromise?.toString().includes('Promise') === true) {
    timeoutHandle = setTimeout(() => {
      console.warn('Node has become unresponsive while starting up.')
      console.warn('Check logging output for potential errors. Exiting...')
      process.exit(1)
    }, 30000)
  }

  const nodeHandle = await clientStartPromise
  if (nodeHandle !== null) {
    console.info('Shutting down the node and the servers...')
    const { client } = nodeHandle
    await client.stop()
    console.info('Exiting.')
  } else {
    console.info('Node did not start properly, exiting...')
  }

  if (timeoutHandle) clearTimeout(timeoutHandle)
  process.exit()
}

async function run() {
  const nodeStartPromise = startClient().catch((e) => {
    console.error('Error starting node', e)
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
  console.log(err)
  console.error(err)
})
