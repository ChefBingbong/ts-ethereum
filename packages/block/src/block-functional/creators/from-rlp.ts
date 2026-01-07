import { RLP } from '@ts-ethereum/rlp'
import { EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { BlockBytes } from '../../types'
import type { CreateBlockOptions, FrozenBlock } from '../types'
import { fromBytesArray } from './from-bytes-array'

export function fromRLP(
  serialized: Uint8Array,
  opts: CreateBlockOptions,
): FrozenBlock {
  if (opts.hardforkManager.isEIPActiveAtHardfork(7934, 'osaka')) {
    const maxRlpBlockSize =
      opts.hardforkManager.getParamAtHardfork('maxRlpBlockSize', 'osaka') ??
      1000000000n
    if (serialized.length > maxRlpBlockSize) {
      throw EthereumJSErrorWithoutCode(
        `Block size exceeds limit: ${serialized.length} > ${maxRlpBlockSize}`,
      )
    }
  }
  const values = RLP.decode(Uint8Array.from(serialized)) as BlockBytes

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized block input. Must be array',
    )
  }

  return fromBytesArray(values, opts)
}
