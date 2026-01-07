import type { EthersProvider } from '@ts-ethereum/utils'
import {
  bigIntToHex,
  EthereumJSErrorWithoutCode,
  fetchFromProvider,
  getProvider,
  intToHex,
  isHexString,
} from '@ts-ethereum/utils'
import type { JSONRPCBlock } from '../../types'
import type { CreateBlockOptions, FrozenBlock } from '../types'
import { fromRPC } from './from-rpc'

export async function fromJSONRPCProvider(
  provider: string | EthersProvider,
  blockTag: string | bigint,
  opts: CreateBlockOptions,
): Promise<FrozenBlock> {
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

  const uncleHeaders: JSONRPCBlock[] = []
  if (blockData.uncles.length > 0) {
    for (let x = 0; x < blockData.uncles.length; x++) {
      const headerData = await fetchFromProvider(providerUrl, {
        method: 'eth_getUncleByBlockHashAndIndex',
        params: [blockData.hash, intToHex(x)],
      })
      uncleHeaders.push(headerData)
    }
  }

  return fromRPC(blockData as JSONRPCBlock, uncleHeaders, opts)
}
