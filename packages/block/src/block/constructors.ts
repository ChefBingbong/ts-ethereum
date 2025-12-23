import { RLP } from '@ts-ethereum/rlp'
import {
  createTx,
  createTxFromBlockBodyData,
  normalizeTxParams,
  type TxOptions,
  type TypedTransaction,
} from '@ts-ethereum/tx'
import type { EthersProvider } from '@ts-ethereum/utils'
import {
  bigIntToHex,
  EthereumJSErrorWithoutCode,
  fetchFromProvider,
  getProvider,
  intToHex,
  isHexString,
} from '@ts-ethereum/utils'
import {
  Block,
  createBlockHeader,
  createBlockHeaderFromBytesArray,
  createBlockHeaderFromRPC,
} from '../index'
import type {
  BlockBytes,
  BlockData,
  BlockOptions,
  HeaderData,
  JSONRPCBlock,
} from '../types'

/**
 * Static constructor to create a block from a block data dictionary
 *
 * @param blockData
 * @param opts
 * @returns a new {@link Block} object
 */
export function createBlock(
  blockData: BlockData = {},
  opts?: BlockOptions,
): Block {
  const {
    header: headerData,
    transactions: txsData,
    uncleHeaders: uhsData,
  } = blockData

  const header = createBlockHeader(headerData, opts)

  // parse transactions
  const transactions = []
  for (const txData of txsData ?? []) {
    const tx = createTx(txData, {
      ...opts,
      // Use header common in case of setHardfork being activated
      common: header.common,
    } as TxOptions)
    transactions.push(tx)
  }

  // parse uncle headers
  const uncleHeaders = []
  const uncleOpts: BlockOptions = {
    ...opts,
    // Use header common in case of setHardfork being activated
    common: header.common,
    // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
    calcDifficultyFromHeader: undefined,
  }
  for (const uhData of uhsData ?? []) {
    const uh = createBlockHeader(uhData, uncleOpts)
    uncleHeaders.push(uh)
  }

  return new Block(header, transactions, uncleHeaders, opts)
}

/**
 * Simple static constructor if only an empty block is needed
 * (tree shaking advantages since it does not draw all the tx constructors in)
 *
 * @param headerData
 * @param opts
 * @returns a new {@link Block} object
 */
export function createEmptyBlock(
  headerData: HeaderData,
  opts?: BlockOptions,
): Block {
  const header = createBlockHeader(headerData, opts)
  return new Block(header)
}

/**
 * Static constructor to create a block from an array of Bytes values
 *
 * @param values
 * @param opts
 * @returns a new {@link Block} object
 */
export function createBlockFromBytesArray(
  values: BlockBytes,
  opts?: BlockOptions,
): Block {
  if (values.length > 3) {
    throw EthereumJSErrorWithoutCode(
      `invalid. More values=${values.length} than expected were received (at most 3 for Frontier)`,
    )
  }

  // First try to load header so that we can use its common
  const [headerData, txsData, uhsData] = values
  const header = createBlockHeaderFromBytesArray(headerData, opts)

  // parse transactions
  const transactions = []
  for (const txData of txsData ?? []) {
    transactions.push(
      createTxFromBlockBodyData(txData, {
        ...opts,
        // Use header common
        common: header.common,
      }),
    )
  }

  // parse uncle headers
  const uncleHeaders = []
  const uncleOpts: BlockOptions = {
    ...opts,
    // Use header common
    common: header.common,
    // Disable this option here (all other options carried over), since this overwrites the provided Difficulty to an incorrect value
    calcDifficultyFromHeader: undefined,
  }
  for (const uncleHeaderData of uhsData ?? []) {
    uncleHeaders.push(
      createBlockHeaderFromBytesArray(uncleHeaderData, uncleOpts),
    )
  }

  return new Block(header, transactions, uncleHeaders, opts)
}

/**
 * Static constructor to create a block from a RLP-serialized block
 *
 * @param serialized
 * @param opts
 * @returns a new {@link Block} object
 */
export function createBlockFromRLP(
  serialized: Uint8Array,
  opts?: BlockOptions,
): Block {
  const values = RLP.decode(Uint8Array.from(serialized)) as BlockBytes

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized block input. Must be array',
    )
  }

  return createBlockFromBytesArray(values, opts)
}

/**
 * Creates a new block object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param uncles - Optional list of Ethereum JSON RPC of uncles (eth_getUncleByBlockHashAndIndex)
 * @param opts - An object describing the blockchain
 * @returns a new {@link Block} object
 */
export function createBlockFromRPC(
  blockParams: JSONRPCBlock,
  uncles: any[] = [],
  options?: BlockOptions,
): Block {
  const header = createBlockHeaderFromRPC(blockParams, options)

  const transactions: TypedTransaction[] = []
  const opts = { common: header.common }
  for (const _txParams of blockParams.transactions ?? []) {
    const txParams = normalizeTxParams(_txParams)
    const tx = createTx(txParams, opts)
    transactions.push(tx)
  }

  const uncleHeaders = uncles.map((uh) => createBlockHeaderFromRPC(uh, options))

  return createBlock({ header, transactions, uncleHeaders }, options)
}

/**
 *  Method to retrieve a block from a JSON-RPC provider and format as a {@link Block}
 * @param provider either a url for a remote provider or an Ethers JSONRPCProvider object
 * @param blockTag block hash or block number to be run
 * @param opts {@link BlockOptions}
 * @returns a new {@link Block} object specified by `blockTag`
 */
export const createBlockFromJSONRPCProvider = async (
  provider: string | EthersProvider,
  blockTag: string | bigint,
  opts: BlockOptions,
): Promise<Block> => {
  let blockData
  const providerUrl = getProvider(provider)

  if (typeof blockTag === 'string' && blockTag.length === 66) {
    blockData = await fetchFromProvider(providerUrl, {
      method: 'eth_getBlockByHash',
      params: [blockTag, true],
    })
  } else if (typeof blockTag === 'bigint') {
    blockData = await fetchFromProvider(providerUrl, {
      method: 'eth_getBlockByNumber',
      params: [bigIntToHex(blockTag), true],
    })
  } else if (
    isHexString(blockTag) ||
    blockTag === 'latest' ||
    blockTag === 'earliest' ||
    blockTag === 'pending' ||
    blockTag === 'finalized' ||
    blockTag === 'safe'
  ) {
    blockData = await fetchFromProvider(providerUrl, {
      method: 'eth_getBlockByNumber',
      params: [blockTag, true],
    })
  } else {
    throw EthereumJSErrorWithoutCode(
      `expected blockTag to be block hash, bigint, hex prefixed string, or earliest/latest/pending; got ${blockTag}`,
    )
  }

  if (blockData === null) {
    throw EthereumJSErrorWithoutCode('No block data returned from provider')
  }

  const uncleHeaders = []
  if (blockData.uncles.length > 0) {
    for (let x = 0; x < blockData.uncles.length; x++) {
      const headerData = await fetchFromProvider(providerUrl, {
        method: 'eth_getUncleByBlockHashAndIndex',
        params: [blockData.hash, intToHex(x)],
      })
      uncleHeaders.push(headerData)
    }
  }

  return createBlockFromRPC(blockData, uncleHeaders, opts)
}
