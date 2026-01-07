// Types

// Creator functions (lower-level, return FrozenBlockHeader)
export {
  fromBytesArray,
  fromHeaderData,
  fromRLP,
  fromRPC,
} from './creators'

// Factory functions (manager pattern)
export {
  createBlockHeaderManagerFromBytes,
  createBlockHeaderManagerFromHeader,
  createBlockHeaderManagerFromRLP,
  createBlockHeaderManagerFromRPC,
} from './header-manager'
// Pure helper functions (for direct use with FrozenBlockHeader)
export {
  // Gas calculations
  calcDataFee,
  calcNextBaseFee,
  calcNextBlobGasPrice,
  calcNextExcessBlobGas,
  // Serialization
  computeHash,
  // Difficulty
  ethashCanonicalDifficulty,
  getBlobGasPrice,
  // Accessors
  getBlockNum,
  getConsensusAlgorithm,
  getConsensusType,
  getHardfork,
  getHash,
  // EIP helpers
  getParam,
  getPrevRandao,
  isEIPActive,
  // Utility
  isGenesis,
  serialize,
  toJSON,
  toRaw,
  validateGasLimit,
} from './helpers'
export type {
  BlockHeaderManager,
  BlockNumContext,
  CoreHeaderFields,
  CreateHeaderOptions,
  EIPHeaderFields,
  FrozenBlockHeader,
  JSONRPCHeaderInput,
  ParentHeaderData,
  ValidatedHeaderData,
} from './types'
