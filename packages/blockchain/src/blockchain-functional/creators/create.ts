/**
 * Factory functions for creating BlockchainManager instances.
 */

import type { Chain } from '@ts-ethereum/chain-config'
import {
  createHardforkManagerFromConfig,
  Mainnet,
} from '@ts-ethereum/chain-config'
import type { DB, DBObject } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  equalsBytes,
  EthereumJSErrorWithoutCode,
  MapDB,
} from '@ts-ethereum/utils'
import { createBlockchainManagerImpl } from '../blockchain-manager'
import {
  createGenesisBlock,
  createSaveLookupOps,
  createSetBlockOrHeaderOps,
  createSetTDOp,
  executeBatch,
  genGenesisStateRoot,
  getGenesisStateRoot,
  getHeadBlock,
  getHeadHeader,
  getHeads,
  numberToHash,
  resolveHardfork,
} from '../helpers'
import type {
  BlockchainManager,
  ConsensusDict,
  CreateBlockchainOptions,
  FrozenBlockchainConfig,
} from '../types'

/**
 * Creates a new BlockchainManager with the given options.
 *
 * This is the main entry point for creating a blockchain instance.
 * It handles:
 * - Resolving the hardfork
 * - Setting up consensus
 * - Creating or loading the genesis block
 * - Loading heads from the database
 *
 * @param opts - Options for creating the blockchain
 * @returns Initialized BlockchainManager
 */
export async function createBlockchainManager(
  opts: CreateBlockchainOptions = {
    hardforkManager: createHardforkManagerFromConfig(Mainnet),
  },
): Promise<BlockchainManager> {
  const hardforkManager = opts.hardforkManager

  // Resolve the initial hardfork
  const fork = resolveHardfork(hardforkManager, opts.hardfork)

  // Use provided consensus dictionary (no defaults - user must provide if needed)
  const consensusDict: ConsensusDict = opts.consensusDict ?? {}

  // Set up database
  const db: DB<Uint8Array | string | number, Uint8Array | string | DBObject> =
    opts.db ?? new MapDB()

  // Determine state root for genesis
  let stateRoot = opts.genesisBlock?.header.stateRoot ?? opts.genesisStateRoot
  if (stateRoot === undefined) {
    if (opts.genesisState !== undefined) {
      stateRoot = await genGenesisStateRoot(opts.genesisState, hardforkManager)
    } else {
      stateRoot = await getGenesisStateRoot(
        Number(hardforkManager.chainId()) as Chain,
        hardforkManager,
      )
    }
  }

  // Create or use provided genesis block
  const genesisBlock =
    opts.genesisBlock ?? createGenesisBlock(stateRoot, hardforkManager)

  // Validate that provided genesis block is actually genesis
  if (opts.genesisBlock && !opts.genesisBlock.isGenesis()) {
    throw EthereumJSErrorWithoutCode('Supplied block is not a genesis block')
  }

  // Create frozen config
  const config: FrozenBlockchainConfig = Object.freeze({
    hardforkManager,
    genesisBlock,
    validateBlocks: opts.validateBlocks ?? true,
    validateConsensus: opts.validateConsensus ?? false,
    hardforkByHeadBlockNumber: opts.hardforkByHeadBlockNumber ?? false,
    fork,
    customGenesisState: opts.genesisState,
  })

  // Create manager implementation
  const manager = createBlockchainManagerImpl(config, db, consensusDict)

  // Set up consensus
  const consensus = manager.consensus
  await consensus?.setup({ blockchain: manager })

  // Check for existing genesis in DB
  let genesisHash = await numberToHash(manager.dbManager, BIGINT_0)
  const dbGenesisBlock =
    genesisHash !== undefined
      ? await manager.dbManager.getBlock(genesisHash)
      : undefined

  // Validate existing genesis matches
  if (
    dbGenesisBlock !== undefined &&
    !equalsBytes(genesisBlock.hash(), dbGenesisBlock.hash())
  ) {
    throw EthereumJSErrorWithoutCode(
      'The genesis block in the DB has a different hash than the provided genesis block.',
    )
  }

  genesisHash = genesisBlock.hash()

  // Store genesis if not already in DB
  if (!dbGenesisBlock) {
    const dbOps = [
      createSetTDOp(genesisBlock.header.difficulty, BIGINT_0, genesisHash),
      ...createSetBlockOrHeaderOps(genesisBlock),
      ...createSaveLookupOps(genesisHash, BIGINT_0),
    ]
    await executeBatch(manager.dbManager, dbOps)
    await consensus?.genesisInit(genesisBlock)
  }

  // Load heads from DB
  const heads = await getHeads(manager.dbManager)
  let headHeaderHash = await getHeadHeader(manager.dbManager)
  let headBlockHash = await getHeadBlock(manager.dbManager)

  // Default to genesis if no heads stored
  headHeaderHash = headHeaderHash ?? genesisHash
  headBlockHash = headBlockHash ?? genesisHash

  // Initialize manager state
  await manager.initializeState(heads, headHeaderHash, headBlockHash)

  // Handle hardfork-by-head-block-number option
  if (config.hardforkByHeadBlockNumber) {
    const latestHeader = await manager.getCanonicalHeadHeader()
    await manager.checkAndTransitionHardForkByNumber(
      latestHeader.number,
      latestHeader.timestamp,
    )
  }

  return manager
}

/**
 * Creates a BlockchainManager from an existing frozen config.
 * Useful for testing or when config is pre-computed.
 *
 * @param config - Pre-created frozen config
 * @param db - Database instance
 * @param consensusDict - Consensus implementations
 * @returns Initialized BlockchainManager
 */
export async function createBlockchainManagerFromConfig(
  config: FrozenBlockchainConfig,
  db: DB<Uint8Array | string | number, Uint8Array | string | DBObject>,
  consensusDict: ConsensusDict = {},
): Promise<BlockchainManager> {
  const manager = createBlockchainManagerImpl(config, db, consensusDict)

  // Set up consensus
  await manager.consensus?.setup({ blockchain: manager })

  // Load genesis into DB if needed
  const genesisHash = config.genesisBlock.hash()
  const existingGenesis = await numberToHash(manager.dbManager, BIGINT_0)

  if (!existingGenesis) {
    const dbOps = [
      createSetTDOp(
        config.genesisBlock.header.difficulty,
        BIGINT_0,
        genesisHash,
      ),
      ...createSetBlockOrHeaderOps(config.genesisBlock),
      ...createSaveLookupOps(genesisHash, BIGINT_0),
    ]
    await executeBatch(manager.dbManager, dbOps)
    await manager.consensus?.genesisInit(config.genesisBlock)
  }

  // Load heads from DB
  const heads = await getHeads(manager.dbManager)
  let headHeaderHash = await getHeadHeader(manager.dbManager)
  let headBlockHash = await getHeadBlock(manager.dbManager)

  headHeaderHash = headHeaderHash ?? genesisHash
  headBlockHash = headBlockHash ?? genesisHash

  await manager.initializeState(heads, headHeaderHash, headBlockHash)

  return manager
}
