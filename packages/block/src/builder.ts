import type { EthersProvider } from '@ts-ethereum/utils'
import { Block } from './block'
import { BlockHeader } from './header'
import type {
  BlockBytes,
  BlockData,
  BlockHeaderBytes,
  BlockOptions,
  ExecutionPayload,
  HeaderData,
  JSONRPCBlock,
} from './types'

export function createBlock(
  blockData: BlockData = {},
  opts?: BlockOptions,
): Block {
  return Block.fromBlockData(blockData, opts)
}

export function createEmptyBlock(
  headerData: HeaderData,
  opts?: BlockOptions,
): Block {
  return Block.createEmpty(headerData, opts)
}

export function createBlockFromBytesArray(
  values: BlockBytes,
  opts?: BlockOptions,
): Block {
  return Block.fromBytesArray(values, opts)
}

export function createBlockFromRLP(
  serialized: Uint8Array,
  opts?: BlockOptions,
): Block {
  return Block.fromRLP(serialized, opts)
}

export function createBlockFromRPC(
  blockParams: JSONRPCBlock,
  uncles: any[] = [],
  options?: BlockOptions,
): Block {
  return Block.fromRPC(blockParams, uncles, options)
}

export const createBlockFromJSONRPCProvider = async (
  provider: string | EthersProvider,
  blockTag: string | bigint,
  opts: BlockOptions,
): Promise<Block> => {
  return Block.fromJSONRPCProvider(provider, blockTag, opts)
}

export async function createBlockFromExecutionPayload(
  payload: ExecutionPayload,
  opts?: BlockOptions,
): Promise<Block> {
  return Block.fromExecutionPayload(payload, opts)
}

export function createSealedCliqueBlock(
  cliqueSigner: Uint8Array,
  blockData: BlockData = {},
  opts: BlockOptions = {},
): Block {
  return Block.createSealedClique(cliqueSigner, blockData, opts)
}

export function createBlockHeader(
  headerData: HeaderData = {},
  opts: BlockOptions = {},
): BlockHeader {
  return BlockHeader.fromHeaderData(headerData, opts)
}

export function createBlockHeaderFromBytesArray(
  values: BlockHeaderBytes,
  opts: BlockOptions = {},
): BlockHeader {
  return BlockHeader.fromBytesArray(values, opts)
}

export function createBlockHeaderFromRLP(
  serializedHeaderData: Uint8Array,
  opts: BlockOptions = {},
): BlockHeader {
  return BlockHeader.fromRLP(serializedHeaderData, opts)
}

export function createBlockHeaderFromRPC(
  blockParams: JSONRPCBlock,
  options?: BlockOptions,
): BlockHeader {
  return BlockHeader.fromRPC(blockParams, options)
}
