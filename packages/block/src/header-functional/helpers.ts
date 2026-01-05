import {
  type AllParamNames,
  ConsensusAlgorithm,
  ConsensusType,
  Hardfork,
  type HardforkParamsMap,
  type ParamType,
} from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToHex,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { computeBlobGasPrice } from '../helpers'
import type { BlockHeaderBytes, JSONHeader } from '../types'
import type {
  BlockNumContext,
  FrozenBlockHeader,
  ParentHeaderData,
} from './types'

export function getBlockNum(header: FrozenBlockHeader): BlockNumContext {
  return {
    blockNumber: header.data.number,
    timestamp: header.data.timestamp,
  }
}

export function getHardfork(header: FrozenBlockHeader): string {
  return header.hardforkManager.getHardforkByBlock(
    header.data.number,
    header.data.timestamp,
  )
}

export function getPrevRandao(header: FrozenBlockHeader): Uint8Array {
  const blockNum = getBlockNum(header)
  if (!header.hardforkManager.isEIPActiveAtBlock(4399, blockNum)) {
    throw EthereumJSErrorWithoutCode(
      'prevRandao can only be accessed when EIP-4399 is activated',
    )
  }
  return header.data.mixHash
}

export function getConsensusType(header: FrozenBlockHeader): string {
  return header.hardforkManager.config.spec.chain?.consensus?.type ?? 'pow'
}

export function getConsensusAlgorithm(header: FrozenBlockHeader): string {
  return (
    header.hardforkManager.config.spec.chain?.consensus?.algorithm ?? 'ethash'
  )
}

export function isEIPActive(header: FrozenBlockHeader, eip: number): boolean {
  return header.hardforkManager.isEIPActiveAtBlock(eip, getBlockNum(header))
}

export function getParam<P extends AllParamNames>(
  header: FrozenBlockHeader,
  name: P,
): ParamType<P> | undefined {
  const hardfork = getHardfork(header)
  return header.hardforkManager.getParamAtHardfork(name, hardfork)
}

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

export function calcNextBlobGasPrice(
  header: FrozenBlockHeader,
  childHardfork: string,
): bigint {
  return computeBlobGasPrice(
    calcNextExcessBlobGas(header, childHardfork),
    header.hardforkManager,
    childHardfork,
  )
}

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

export function toRaw(header: FrozenBlockHeader): BlockHeaderBytes {
  const data = header.data
  const rawItems: Uint8Array[] = [
    data.parentHash,
    data.uncleHash,
    data.coinbase.bytes,
    data.stateRoot,
    data.transactionsTrie,
    data.receiptTrie,
    data.logsBloom,
    bigIntToUnpaddedBytes(data.difficulty),
    bigIntToUnpaddedBytes(data.number),
    bigIntToUnpaddedBytes(data.gasLimit),
    bigIntToUnpaddedBytes(data.gasUsed),
    bigIntToUnpaddedBytes(data.timestamp ?? BIGINT_0),
    data.extraData,
    data.mixHash,
    data.nonce,
  ]

  if (isEIPActive(header, 1559)) {
    rawItems.push(bigIntToUnpaddedBytes(data.baseFeePerGas!))
  }
  if (isEIPActive(header, 4895)) {
    rawItems.push(data.withdrawalsRoot!)
  }
  if (isEIPActive(header, 4844)) {
    rawItems.push(bigIntToUnpaddedBytes(data.blobGasUsed!))
    rawItems.push(bigIntToUnpaddedBytes(data.excessBlobGas!))
  }
  if (isEIPActive(header, 4788)) {
    rawItems.push(data.parentBeaconBlockRoot!)
  }
  if (isEIPActive(header, 7685)) {
    rawItems.push(data.requestsHash!)
  }

  return rawItems
}

export function computeHash(header: FrozenBlockHeader): Uint8Array {
  return keccak256(RLP.encode(toRaw(header)))
}

export function getHash(header: FrozenBlockHeader): Uint8Array {
  if (header._cache.hash !== undefined) {
    return header._cache.hash
  }
  return computeHash(header)
}

export function serialize(header: FrozenBlockHeader): Uint8Array {
  return RLP.encode(toRaw(header))
}

export function toJSON(header: FrozenBlockHeader): JSONHeader {
  const data = header.data
  const withdrawalAttr = data.withdrawalsRoot
    ? { withdrawalsRoot: bytesToHex(data.withdrawalsRoot) }
    : {}

  const JSONDict: JSONHeader = {
    parentHash: bytesToHex(data.parentHash),
    uncleHash: bytesToHex(data.uncleHash),
    coinbase: data.coinbase.toString(),
    stateRoot: bytesToHex(data.stateRoot),
    transactionsTrie: bytesToHex(data.transactionsTrie),
    ...withdrawalAttr,
    receiptTrie: bytesToHex(data.receiptTrie),
    logsBloom: bytesToHex(data.logsBloom),
    difficulty: bigIntToHex(data.difficulty),
    number: bigIntToHex(data.number),
    gasLimit: bigIntToHex(data.gasLimit),
    gasUsed: bigIntToHex(data.gasUsed),
    timestamp: bigIntToHex(data.timestamp),
    extraData: bytesToHex(data.extraData),
    mixHash: bytesToHex(data.mixHash),
    nonce: bytesToHex(data.nonce),
  }

  if (isEIPActive(header, 1559)) {
    JSONDict.baseFeePerGas = bigIntToHex(data.baseFeePerGas!)
  }
  if (isEIPActive(header, 4844)) {
    JSONDict.blobGasUsed = bigIntToHex(data.blobGasUsed!)
    JSONDict.excessBlobGas = bigIntToHex(data.excessBlobGas!)
  }
  if (isEIPActive(header, 4788)) {
    JSONDict.parentBeaconBlockRoot = bytesToHex(data.parentBeaconBlockRoot!)
  }
  if (isEIPActive(header, 7685)) {
    JSONDict.requestsHash = bytesToHex(data.requestsHash!)
  }

  return JSONDict
}

export function isGenesis(header: FrozenBlockHeader): boolean {
  return header.data.number === BIGINT_0
}
