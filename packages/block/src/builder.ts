import type { EthersProvider } from '@ts-ethereum/utils'
import {
  type BlockManager,
  createBlockManagerCreateEmpty,
  createBlockManagerCreateSealedClique,
  createBlockManagerFromBlockData,
  createBlockManagerFromBytes,
  createBlockManagerFromExecutionPayload,
  createBlockManagerFromJSONRPCProvider,
  createBlockManagerFromRLP,
  createBlockManagerFromRPC,
} from './block-functional'
import {
  type BlockHeaderManager,
  createBlockHeaderManagerFromBytes,
  createBlockHeaderManagerFromHeader,
  createBlockHeaderManagerFromRLP,
  createBlockHeaderManagerFromRPC,
} from './header-functional'
import { fromHeaderData } from './header-functional/creators'
import type {
  BlockBytes,
  BlockData,
  BlockHeaderBytes,
  BlockOptions,
  ExecutionPayload,
  HeaderData,
  JSONRPCBlock,
} from './types'

// Backward compatibility: Block is now BlockManager
export type Block = BlockManager

export function createBlock(blockData: BlockData, opts: BlockOptions): Block {
  return createBlockManagerFromBlockData(blockData, opts)
}

export function createEmptyBlock(
  headerData: HeaderData,
  opts: BlockOptions,
): Block {
  return createBlockManagerCreateEmpty(headerData, opts)
}

export function createBlockFromBytesArray(
  values: BlockBytes,
  opts: BlockOptions,
): Block {
  return createBlockManagerFromBytes(values, opts)
}

export function createBlockFromRLP(
  serialized: Uint8Array,
  opts: BlockOptions,
): Block {
  return createBlockManagerFromRLP(serialized, opts)
}

export function createBlockFromRPC(
  blockParams: JSONRPCBlock,
  uncles: any[],
  options: BlockOptions,
): Block {
  return createBlockManagerFromRPC(blockParams, uncles, options)
}

export const createBlockFromJSONRPCProvider = async (
  provider: string | EthersProvider,
  blockTag: string | bigint,
  opts: BlockOptions,
): Promise<Block> => {
  return createBlockManagerFromJSONRPCProvider(provider, blockTag, opts)
}

export async function createBlockFromExecutionPayload(
  payload: ExecutionPayload,
  opts: BlockOptions,
): Promise<Block> {
  return createBlockManagerFromExecutionPayload(payload, opts)
}

export function createSealedCliqueBlock(
  cliqueSigner: Uint8Array,
  blockData: BlockData,
  opts: BlockOptions,
): Block {
  return createBlockManagerCreateSealedClique(cliqueSigner, blockData, opts)
}

export function createBlockHeader(
  headerData: HeaderData,
  opts: BlockOptions,
): BlockHeaderManager {
  const frozenHeader = fromHeaderData(headerData, {
    ...opts,
    calcDifficultyFromHeader: opts.calcDifficultyFromHeader
      ? {
          timestamp: opts.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: opts.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: opts.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: opts.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
  })
  return createBlockHeaderManagerFromHeader(frozenHeader)
}

export function createBlockHeaderFromBytesArray(
  values: BlockHeaderBytes,
  opts: BlockOptions,
): BlockHeaderManager {
  return createBlockHeaderManagerFromBytes(values, {
    ...opts,
    calcDifficultyFromHeader: opts.calcDifficultyFromHeader
      ? {
          timestamp: opts.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: opts.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: opts.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: opts.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
  })
}

export function createBlockHeaderFromRLP(
  serializedHeaderData: Uint8Array,
  opts: BlockOptions,
): BlockHeaderManager {
  return createBlockHeaderManagerFromRLP(serializedHeaderData, {
    ...opts,
    calcDifficultyFromHeader: opts.calcDifficultyFromHeader
      ? {
          timestamp: opts.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: opts.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: opts.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: opts.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
  })
}

export function createBlockHeaderFromRPC(
  blockParams: JSONRPCBlock,
  options: BlockOptions,
): BlockHeaderManager {
  return createBlockHeaderManagerFromRPC(blockParams, {
    ...options,
    calcDifficultyFromHeader: options.calcDifficultyFromHeader
      ? {
          timestamp: options.calcDifficultyFromHeader.header.data.timestamp,
          difficulty: options.calcDifficultyFromHeader.header.data.difficulty,
          uncleHash: options.calcDifficultyFromHeader.header.data.uncleHash,
          gasLimit: options.calcDifficultyFromHeader.header.data.gasLimit,
        }
      : undefined,
  })
}
