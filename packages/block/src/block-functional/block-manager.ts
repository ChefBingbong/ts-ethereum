import type { AllParamNames } from '@ts-ethereum/chain-config'
import type { EthersProvider } from '@ts-ethereum/utils'
import type { BlockHeaderManager } from '../header-functional'
import { createBlockHeaderManagerFromHeader } from '../header-functional'
import type {
  BlockBytes,
  BlockData,
  ExecutionPayload,
  HeaderData,
  JSONRPCBlock,
} from '../types'
import {
  createEmpty,
  createSealedClique,
  fromBlockData,
  fromBytesArray,
  fromExecutionPayload,
  fromJSONRPCProvider,
  fromRLP,
  fromRPC,
} from './creators'
import {
  errorStr,
  genTxTrie,
  getHardfork,
  getHash,
  getParam,
  getTransactionsValidationErrors,
  isEIPActive,
  isGenesis,
  serialize,
  toExecutionPayload,
  toJSON,
  toRaw,
  transactionsAreValid,
  transactionsTrieIsValid,
  uncleHashIsValid,
  validateBlobTransactions,
  validateData,
  validateGasLimit,
  validateUncles,
  withdrawalsTrieIsValid,
} from './helpers'
import type { BlockManager, CreateBlockOptions, FrozenBlock } from './types'

function _createManagerFromBlock(block: FrozenBlock): BlockManager {
  const headerManager = createBlockHeaderManagerFromHeader(block.header)
  const uncleHeaderManagers = block.uncleHeaders.map((uh) =>
    createBlockHeaderManagerFromHeader(uh),
  )

  return Object.freeze({
    block,
    // Backward compatibility properties
    header: headerManager,
    transactions: block.transactions,
    uncleHeaders: uncleHeaderManagers,
    withdrawals: block.withdrawals,
    hardforkManager: block.hardforkManager,
    hardfork: getHardfork(block),

    // EIP helpers
    isEIPActive: (eip: number) => isEIPActive(block, eip),
    param: <P extends AllParamNames>(name: P) => getParam(block, name),

    // Serialization
    raw: () => toRaw(block),
    hash: () => getHash(block),
    serialize: () => serialize(block),
    toJSON: () => toJSON(block),
    toExecutionPayload: () => toExecutionPayload(block),

    // Validation
    transactionsAreValid: () => transactionsAreValid(block),
    getTransactionsValidationErrors: () =>
      getTransactionsValidationErrors(block),
    transactionsTrieIsValid: () => transactionsTrieIsValid(block),
    uncleHashIsValid: () => uncleHashIsValid(block),
    withdrawalsTrieIsValid: () => withdrawalsTrieIsValid(block),
    validateData: (
      onlyHeader?: boolean,
      verifyTxs?: boolean,
      validateBlockSize?: boolean,
    ) => validateData(block, onlyHeader, verifyTxs, validateBlockSize),
    validateBlobTransactions: (parentHeader: BlockHeaderManager) =>
      validateBlobTransactions(block, parentHeader),
    validateUncles: () => validateUncles(block),
    validateGasLimit: (parentBlock: BlockManager) =>
      validateGasLimit(block, parentBlock.block),

    // Utility
    isGenesis: () => isGenesis(block),
    errorStr: () => errorStr(block),

    // Async helpers
    genTxTrie: () => genTxTrie(block),
  })
}

export function createBlockManagerFromBlockData(
  blockData: BlockData,
  opts: CreateBlockOptions,
): BlockManager {
  const block = fromBlockData(blockData, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerFromBytes(
  values: BlockBytes,
  opts: CreateBlockOptions,
): BlockManager {
  const block = fromBytesArray(values, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerFromRLP(
  serialized: Uint8Array,
  opts: CreateBlockOptions,
): BlockManager {
  const block = fromRLP(serialized, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerFromRPC(
  blockParams: JSONRPCBlock,
  uncles: any[],
  opts: CreateBlockOptions,
): BlockManager {
  const block = fromRPC(blockParams, uncles, opts)
  return _createManagerFromBlock(block)
}

export async function createBlockManagerFromExecutionPayload(
  payload: ExecutionPayload,
  opts: CreateBlockOptions,
): Promise<BlockManager> {
  const block = await fromExecutionPayload(payload, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerFromBlock(block: FrozenBlock): BlockManager {
  return _createManagerFromBlock(block)
}

export function createBlockManagerCreateEmpty(
  headerDataOrManager: HeaderData | BlockHeaderManager,
  opts: CreateBlockOptions,
): BlockManager {
  // If it's a BlockHeaderManager, use fromHeader to preserve the exact header state
  if ('header' in headerDataOrManager && 'blockNum' in headerDataOrManager) {
    const header = headerDataOrManager as BlockHeaderManager
    return createBlockManagerFromHeader(header, opts)
  }
  // Otherwise it's HeaderData, create a new header
  const headerData = headerDataOrManager as HeaderData
  const block = createEmpty(headerData, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerFromHeader(
  header: BlockHeaderManager,
  opts?: CreateBlockOptions,
): BlockManager {
  // Use the existing header manager directly - don't recreate it
  // This matches the old Block class behavior where the header was stored directly
  // IMPORTANT: Use the header's hardforkManager, not opts.hardforkManager, to preserve exact state
  const block: FrozenBlock = {
    header: header.header, // Use the FrozenBlockHeader directly - preserves exact stateRoot
    transactions: Object.freeze([]) as readonly [],
    uncleHeaders: Object.freeze([]) as readonly [],
    withdrawals: undefined,
    hardforkManager: header.hardforkManager, // Use header's hardforkManager to match header exactly
    _cache: {
      txTrieRoot: undefined,
      withdrawalsTrieRoot: undefined,
      hash: undefined,
    },
  }

  // Reuse the existing header manager instead of recreating it
  const uncleHeaderManagers = Object.freeze([]) as readonly []

  return Object.freeze({
    block,
    // Backward compatibility properties
    header, // Reuse the existing header manager directly
    transactions: block.transactions,
    uncleHeaders: uncleHeaderManagers,
    withdrawals: block.withdrawals,
    hardforkManager: block.hardforkManager,
    // EIP helpers
    isEIPActive: (eip: number) => header.isEIPActive(eip),
    param: <P extends AllParamNames>(name: P) => header.param(name),
    // Hardfork access
    hardfork: header.hardfork,
    // Serialization
    raw: () => toRaw(block),
    hash: () => getHash(block),
    serialize: () => serialize(block),
    toJSON: () => toJSON(block),
    toExecutionPayload: () => toExecutionPayload(block),
    // Validation
    transactionsAreValid: () => transactionsAreValid(block),
    getTransactionsValidationErrors: () =>
      getTransactionsValidationErrors(block),
    transactionsTrieIsValid: () => transactionsTrieIsValid(block),
    uncleHashIsValid: () => uncleHashIsValid(block),
    withdrawalsTrieIsValid: () => withdrawalsTrieIsValid(block),
    validateData: (
      onlyHeader?: boolean,
      verifyTxs?: boolean,
      validateBlockSize?: boolean,
    ) => validateData(block, onlyHeader, verifyTxs, validateBlockSize),
    validateBlobTransactions: (parentHeader: BlockHeaderManager) =>
      validateBlobTransactions(block, parentHeader),
    validateUncles: () => validateUncles(block),
    validateGasLimit: (parentBlock: BlockManager) =>
      validateGasLimit(block, parentBlock.block),
    // Utility
    isGenesis: () => isGenesis(block),
    errorStr: () => errorStr(block),
    // Async helpers
    genTxTrie: () => genTxTrie(block),
  })
}

export async function createBlockManagerFromJSONRPCProvider(
  provider: string | EthersProvider,
  blockTag: string | bigint,
  opts: CreateBlockOptions,
): Promise<BlockManager> {
  const block = await fromJSONRPCProvider(provider, blockTag, opts)
  return _createManagerFromBlock(block)
}

export function createBlockManagerCreateSealedClique(
  cliqueSigner: Uint8Array,
  blockData: BlockData,
  opts: CreateBlockOptions,
): BlockManager {
  const block = createSealedClique(cliqueSigner, blockData, opts)
  return _createManagerFromBlock(block)
}
