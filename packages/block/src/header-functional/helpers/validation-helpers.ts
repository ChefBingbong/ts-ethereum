import { Hardfork } from '@ts-ethereum/chain-config'
import { BIGINT_0, EthereumJSErrorWithoutCode } from '@ts-ethereum/utils'
import type { FrozenBlockHeader } from '../types'
import { getHardfork } from './getters'

export function validateGasLimit(
  header: FrozenBlockHeader,
  parentGasLimit: bigint,
): void {
  let adjustedParentGasLimit = parentGasLimit
  const londonHfBlock = header.hardforkManager.hardforkBlock(Hardfork.London)

  if (
    typeof londonHfBlock === 'bigint' &&
    londonHfBlock !== BIGINT_0 &&
    header.data.number === londonHfBlock
  ) {
    const elasticity = header.hardforkManager.getParamAtHardfork(
      'elasticityMultiplier',
      getHardfork(header),
    )
    if (elasticity !== undefined) {
      adjustedParentGasLimit = adjustedParentGasLimit * BigInt(elasticity)
    }
  }

  const gasLimit = header.data.gasLimit
  const hardfork = getHardfork(header)
  const gasLimitBoundDivisor =
    header.hardforkManager.getParamAtHardfork(
      'gasLimitBoundDivisor',
      hardfork,
    ) ?? 0n

  const a = adjustedParentGasLimit / BigInt(gasLimitBoundDivisor)
  const maxGasLimit = adjustedParentGasLimit + a
  const minGasLimit = adjustedParentGasLimit - a

  if (gasLimit >= maxGasLimit) {
    throw EthereumJSErrorWithoutCode(
      `gas limit increased too much: ${gasLimit} >= ${maxGasLimit}`,
    )
  }
  if (gasLimit <= minGasLimit) {
    throw EthereumJSErrorWithoutCode(
      `gas limit decreased too much: ${gasLimit} <= ${minGasLimit}`,
    )
  }
  if (gasLimit < minGasLimit) {
    throw EthereumJSErrorWithoutCode(
      `gas limit below minimum: ${gasLimit} < ${minGasLimit}`,
    )
  }
}
