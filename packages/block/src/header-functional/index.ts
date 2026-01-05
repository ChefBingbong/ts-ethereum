// Types
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

// Factory functions (manager pattern)
export {
  createBlockHeaderManager,
  createBlockHeaderManagerFromBytes,
  createBlockHeaderManagerFromRLP,
  createBlockHeaderManagerFromRPC,
} from './header-manager'

// Creator functions (lower-level, return FrozenBlockHeader)
export {
  fromBytesArray,
  fromHeaderData,
  fromRLP,
  fromRPC,
} from './creators'

// Pure helper functions (for direct use with FrozenBlockHeader)
export {
  // Accessors
  getBlockNum,
  getConsensusAlgorithm,
  getConsensusType,
  getHardfork,
  getPrevRandao,

  // EIP helpers
  getParam,
  isEIPActive,

  // Gas calculations
  calcDataFee,
  calcNextBaseFee,
  calcNextBlobGasPrice,
  calcNextExcessBlobGas,
  getBlobGasPrice,
  validateGasLimit,

  // Difficulty
  ethashCanonicalDifficulty,

  // Serialization
  computeHash,
  getHash,
  serialize,
  toJSON,
  toRaw,

  // Utility
  isGenesis,
} from './helpers'

