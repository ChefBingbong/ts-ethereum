import type { AllParamNames } from '@ts-ethereum/chain-config'
import { fromBytesArray, fromRLP, fromRPC } from './creators'
import {
  calcDataFee,
  calcNextBaseFee,
  calcNextBlobGasPrice,
  calcNextExcessBlobGas,
  ethashCanonicalDifficulty,
  getBlobGasPrice,
  getConsensusAlgorithm,
  getConsensusType,
  getHash,
  getParam,
  isEIPActive,
  isGenesis,
  serialize,
  toJSON,
  toRaw,
  validateGasLimit,
} from './helpers'
import { getBlockNum, getHardfork, getPrevRandao } from './helpers/getters'
import type {
  BlockHeaderBytes,
  CreateHeaderOptions,
  FrozenBlockHeader,
  JSONRPCHeaderInput,
  ParentHeaderData,
} from './types'

export function createBlockHeaderManagerFromBytes(
  values: BlockHeaderBytes,
  opts: CreateHeaderOptions,
) {
  const header = fromBytesArray(values, opts)
  return _createManagerFromHeader(header)
}

export function createBlockHeaderManagerFromRLP(
  serializedHeaderData: Uint8Array,
  opts: CreateHeaderOptions,
) {
  const header = fromRLP(serializedHeaderData, opts)
  return _createManagerFromHeader(header)
}

export function createBlockHeaderManagerFromRPC(
  blockParams: JSONRPCHeaderInput,
  opts: CreateHeaderOptions,
) {
  const header = fromRPC(blockParams, opts)
  return _createManagerFromHeader(header)
}

function _createManagerFromHeader(header: FrozenBlockHeader) {
  const data = header.data

  // Get prevRandao safely - it's mixHash when EIP-4399 is active, otherwise mixHash is still used
  let prevRandaoValue: Uint8Array
  try {
    prevRandaoValue = getPrevRandao(header)
  } catch {
    // If EIP-4399 is not active, prevRandao is still mixHash (for backward compatibility)
    prevRandaoValue = header.data.mixHash
  }

  return Object.freeze({
    header,
    blockNum: getBlockNum(header),
    prevRandao: prevRandaoValue,
    // Backward compatibility properties (matching old BlockHeader class)
    parentHash: data.parentHash,
    uncleHash: data.uncleHash,
    coinbase: data.coinbase,
    stateRoot: data.stateRoot,
    transactionsTrie: data.transactionsTrie,
    receiptTrie: data.receiptTrie,
    logsBloom: data.logsBloom,
    difficulty: data.difficulty,
    number: data.number,
    gasLimit: data.gasLimit,
    gasUsed: data.gasUsed,
    timestamp: data.timestamp,
    extraData: data.extraData,
    mixHash: data.mixHash,
    nonce: data.nonce,
    baseFeePerGas: data.baseFeePerGas,
    withdrawalsRoot: data.withdrawalsRoot,
    blobGasUsed: data.blobGasUsed,
    excessBlobGas: data.excessBlobGas,
    parentBeaconBlockRoot: data.parentBeaconBlockRoot,
    requestsHash: data.requestsHash,
    hardforkManager: header.hardforkManager,
    hardfork: getHardfork(header),
    consensusType: getConsensusType(header),
    consensusAlgorithm: getConsensusAlgorithm(header),
    // Methods
    raw: () => toRaw(header),
    hash: () => getHash(header),
    serialize: () => serialize(header),
    toJSON: () => toJSON(header),
    isGenesis: () => isGenesis(header),
    isEIPActive: (eip: number) => isEIPActive(header, eip),
    param: <P extends AllParamNames>(name: P) => getParam(header, name),
    validateGasLimit: (gasLimit: bigint) => validateGasLimit(header, gasLimit),
    calcNextBaseFee: () => calcNextBaseFee(header),
    getBlobGasPrice: () => getBlobGasPrice(header),
    calcDataFee: (numBlobs: number) => calcDataFee(header, numBlobs),

    calcNextExcessBlobGas: (childHardfork: string) =>
      calcNextExcessBlobGas(header, childHardfork),
    calcNextBlobGasPrice: (childHardfork: string) =>
      calcNextBlobGasPrice(header, childHardfork),

    ethashCanonicalDifficulty: (
      parentBlockHeader: ParentHeaderData | undefined,
    ) => ethashCanonicalDifficulty(header, parentBlockHeader),
  })
}

export function createBlockHeaderManagerFromHeader(header: FrozenBlockHeader) {
  return _createManagerFromHeader(header)
}
