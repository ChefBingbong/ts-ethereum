import {
  BIGINT_0,
  BIGINT_1,
  EthereumJSErrorWithoutCode,
} from '@ts-ethereum/utils'
import { computeBlobGasPrice } from '../../helpers'
import { getHardfork, isEIPActive } from '../helpers'
import type { FrozenBlockHeader } from '../types'

export function calcNextBaseFee(header: FrozenBlockHeader): bigint {
  if (!isEIPActive(header, 1559)) {
    throw EthereumJSErrorWithoutCode(
      'calcNextBaseFee() requires EIP1559 activation',
    )
  }

  const hardfork = getHardfork(header)
  const elasticity = BigInt(
    header.hardforkManager.getParamAtHardfork(
      'elasticityMultiplier',
      hardfork,
    ) ?? 0n,
  )
  const parentGasTarget = header.data.gasLimit / elasticity

  if (parentGasTarget === header.data.gasUsed) {
    return header.data.baseFeePerGas!
  }

  const denominator =
    header.hardforkManager.getParamAtHardfork(
      'baseFeeMaxChangeDenominator',
      hardfork,
    ) ?? 8n

  if (header.data.gasUsed > parentGasTarget) {
    const delta = header.data.gasUsed - parentGasTarget
    const calc =
      (header.data.baseFeePerGas! * delta) / parentGasTarget / denominator
    return (calc > BIGINT_1 ? calc : BIGINT_1) + header.data.baseFeePerGas!
  }

  const delta = parentGasTarget - header.data.gasUsed
  const calc =
    (header.data.baseFeePerGas! * delta) / parentGasTarget / denominator
  const result = header.data.baseFeePerGas! - calc
  return result > BIGINT_0 ? result : BIGINT_0
}

export function getBlobGasPrice(header: FrozenBlockHeader): bigint {
  if (header.data.excessBlobGas === undefined) {
    throw EthereumJSErrorWithoutCode('excessBlobGas field not populated')
  }
  return computeBlobGasPrice(
    header.data.excessBlobGas,
    header.hardforkManager,
    getHardfork(header),
  )
}

export function calcDataFee(
  header: FrozenBlockHeader,
  numBlobs: number,
): bigint {
  const hardfork = getHardfork(header)
  const blobGasPerBlob =
    header.hardforkManager.getParamAtHardfork('blobGasPerBlob', hardfork) ?? 0n
  return blobGasPerBlob * BigInt(numBlobs) * getBlobGasPrice(header)
}

export function calcNextExcessBlobGas(
  header: FrozenBlockHeader,
  childHardfork: string,
): bigint {
  const excessBlobGas = header.data.excessBlobGas ?? BIGINT_0
  const blobGasUsed = header.data.blobGasUsed ?? BIGINT_0

  const targetBlobGasPerBlock =
    header.hardforkManager.getParamAtHardfork(
      'targetBlobGasPerBlock',
      childHardfork,
    ) ?? BIGINT_0
  const maxBlobGasPerBlock =
    header.hardforkManager.getParamAtHardfork(
      'maxBlobGasPerBlock',
      childHardfork,
    ) ?? BIGINT_0

  if (excessBlobGas + blobGasUsed < targetBlobGasPerBlock) {
    return BIGINT_0
  }

  if (header.hardforkManager.isEIPActiveAtHardfork(7918, childHardfork)) {
    const blobBaseCost =
      header.hardforkManager.getParamAtHardfork(
        'blobBaseCost',
        childHardfork,
      ) ?? BIGINT_0
    const gasPerBlob =
      header.hardforkManager.getParamAtHardfork(
        'blobGasPerBlob',
        childHardfork,
      ) ?? 0n
    const baseFee = header.data.baseFeePerGas ?? BIGINT_0
    const blobFee = getBlobGasPrice(header)

    if (blobBaseCost * baseFee > gasPerBlob * blobFee) {
      const increase =
        (blobGasUsed * (maxBlobGasPerBlock - targetBlobGasPerBlock)) /
        maxBlobGasPerBlock
      return excessBlobGas + increase
    }
  }

  return excessBlobGas + blobGasUsed - targetBlobGasPerBlock
}
