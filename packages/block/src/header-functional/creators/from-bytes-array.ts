import { Hardfork } from '@ts-ethereum/chain-config'
import {
  bigIntToBytes,
  EthereumJSErrorWithoutCode,
  equalsBytes,
} from '@ts-ethereum/utils'
import { valuesArrayToHeaderData } from '../../helpers'
import type { BlockHeaderBytes } from '../../types'
import { getBlockNum } from '../helpers'
import type { CreateHeaderOptions, FrozenBlockHeader } from '../types'
import { fromHeaderData } from './from-header-data'

export function fromBytesArray(
  values: BlockHeaderBytes,
  opts: CreateHeaderOptions,
): FrozenBlockHeader {
  const headerData = valuesArrayToHeaderData(values)
  const {
    number,
    baseFeePerGas,
    excessBlobGas,
    blobGasUsed,
    parentBeaconBlockRoot,
    requestsHash,
  } = headerData

  const header = fromHeaderData(headerData, opts)

  const blockNum = getBlockNum(header)

  if (
    header.hardforkManager.isEIPActiveAtBlock(1559, blockNum) &&
    baseFeePerGas === undefined
  ) {
    const eip1559ActivationBlock = bigIntToBytes(
      header.hardforkManager.hardforkBlock(Hardfork.London)!,
    )
    if (
      eip1559ActivationBlock !== undefined &&
      equalsBytes(eip1559ActivationBlock, number as Uint8Array)
    ) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. baseFeePerGas should be provided',
      )
    }
  }

  if (header.hardforkManager.isEIPActiveAtBlock(4844, blockNum)) {
    if (excessBlobGas === undefined) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. excessBlobGas should be provided',
      )
    }
    if (blobGasUsed === undefined) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. blobGasUsed should be provided',
      )
    }
  }

  if (
    header.hardforkManager.isEIPActiveAtBlock(4788, blockNum) &&
    parentBeaconBlockRoot === undefined
  ) {
    throw EthereumJSErrorWithoutCode(
      'invalid header. parentBeaconBlockRoot should be provided',
    )
  }

  if (
    header.hardforkManager.isEIPActiveAtBlock(7685, blockNum) &&
    requestsHash === undefined
  ) {
    throw EthereumJSErrorWithoutCode(
      'invalid header. requestsHash should be provided',
    )
  }

  return header
}
