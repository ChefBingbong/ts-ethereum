import {
  ConsensusAlgorithm,
  ConsensusType,
  Hardfork,
  type HardforkParamsMap,
} from '@ts-ethereum/chain-config'
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  equalsBytes,
  EthereumJSErrorWithoutCode,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'
import type { FrozenBlockHeader, ParentHeaderData } from '../types'
import { getConsensusAlgorithm, getConsensusType, getHardfork } from './getters'

export function ethashCanonicalDifficulty(
  header: FrozenBlockHeader,
  parentBlockHeader: ParentHeaderData | undefined,
): bigint {
  const consensusAlgorithm = getConsensusAlgorithm(header)

  if (!parentBlockHeader || consensusAlgorithm !== ConsensusAlgorithm.Ethash) {
    return header.data.difficulty
  }

  const consensusType = getConsensusType(header)
  if (consensusType !== ConsensusType.ProofOfWork) {
    throw EthereumJSErrorWithoutCode(
      'difficulty calculation only supported on PoW chains',
    )
  }
  if (consensusAlgorithm !== ConsensusAlgorithm.Ethash) {
    throw EthereumJSErrorWithoutCode(
      'difficulty calculation only supports ethash algorithm',
    )
  }

  const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader
  const blockTs = header.data.timestamp
  const hardfork = getHardfork(header)

  const params = header.hardforkManager.getParamsAtHardfork(
    hardfork as keyof HardforkParamsMap,
  )
  const minimumDifficulty = params.minimumDifficulty ?? 0n
  const difficultyBoundDivisor = params.difficultyBoundDivisor ?? 0n
  const offset = parentDif / difficultyBoundDivisor

  let num = header.data.number
  let dif!: bigint

  if (header.hardforkManager.hardforkGte(hardfork, Hardfork.Byzantium)) {
    const uncleAddend = equalsBytes(
      parentBlockHeader.uncleHash,
      KECCAK256_RLP_ARRAY,
    )
      ? 1
      : 2
    let a = BigInt(uncleAddend) - (blockTs - parentTs) / BigInt(9)
    if (BigInt(-99) > a) a = BigInt(-99)
    dif = parentDif + offset * a
    const difficultyBombDelay = params.difficultyBombDelay ?? BIGINT_0
    num = num - difficultyBombDelay
    if (num < BIGINT_0) num = BIGINT_0
  } else if (header.hardforkManager.hardforkGte(hardfork, Hardfork.Homestead)) {
    let a = BIGINT_1 - (blockTs - parentTs) / BigInt(10)
    if (BigInt(-99) > a) a = BigInt(-99)
    dif = parentDif + offset * a
  } else {
    const durationLimit = params.durationLimit ?? 13n
    dif =
      parentTs + durationLimit > blockTs
        ? offset + parentDif
        : parentDif - offset
  }

  const exp = num / BigInt(100000) - BIGINT_2
  if (exp >= 0) dif = dif + BIGINT_2 ** exp
  if (dif < minimumDifficulty) dif = minimumDifficulty

  return dif
}
