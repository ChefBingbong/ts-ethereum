import type { AllParamNames } from '@ts-ethereum/chain-config'
import { fromBytesArray, fromRLP, fromRPC } from './creators'
import {
  calcDataFee,
  calcNextBaseFee,
  calcNextBlobGasPrice,
  calcNextExcessBlobGas,
  ethashCanonicalDifficulty,
  getBlobGasPrice,
  getBlockNum,
  getConsensusAlgorithm,
  getConsensusType,
  getHardfork,
  getHash,
  getParam,
  getPrevRandao,
  isEIPActive,
  isGenesis,
  serialize,
  toJSON,
  toRaw,
  validateGasLimit,
} from './helpers'
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
  return Object.freeze({
    header,
    blockNum: () => getBlockNum(header),
    hardfork: () => getHardfork(header),
    prevRandao: () => getPrevRandao(header),
    consensusType: () => getConsensusType(header),
    consensusAlgorithm: () => getConsensusAlgorithm(header),
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
