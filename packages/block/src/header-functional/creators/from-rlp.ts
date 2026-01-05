import { RLP } from '@ts-ethereum/rlp'
import { EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { CreateHeaderOptions, FrozenBlockHeader } from '../types'
import { fromBytesArray } from './from-bytes-array'

export function fromRLP(
  serializedHeaderData: Uint8Array,
  opts: CreateHeaderOptions,
): FrozenBlockHeader {
  const values = RLP.decode(serializedHeaderData)

  if (!Array.isArray(values)) {
    throw EthereumJSErrorWithoutCode(
      'Invalid serialized header input. Must be array',
    )
  }

  return fromBytesArray(values as Uint8Array[], opts)
}
