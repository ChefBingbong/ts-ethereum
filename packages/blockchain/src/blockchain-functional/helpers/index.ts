/**
 * Pure helper functions for blockchain operations.
 * Re-exports all helpers organized by category.
 */

// Chain helpers - Reorg and canonical chain operations
export {
  type ChainOperationContext,
  createDeleteCanonicalChainOps,
  createDeleteChildOps,
  createRebuildCanonicalOps,
  type DeleteCanonicalResult,
  findCommonAncestor,
  getCanonicalHeader,
  getHeaderByHash,
  type RebuildCanonicalResult,
  safeNumberToHash,
} from './chain-helpers'
// DB Accessors - Pure DB read/write operations
export {
  createDeleteBlockOps,
  createDeleteBodyOp,
  createDeleteHashToNumberOp,
  createDeleteHeaderOp,
  createDeleteNumberToHashOp,
  createDeleteTDOp,
  createSaveHeadOps,
  createSaveLookupOps,
  createSetBlockOrHeaderOps,
  createSetHashToNumberOp,
  // Write operation builders
  createSetTDOp,
  // Re-exports
  DBOp,
  DBTarget,
  // Execute
  executeBatch,
  // Read operations
  getBlock,
  getHeadBlock,
  getHeader,
  getHeadHeader,
  getHeads,
  getTotalDifficulty,
  hashToNumber,
  numberToHash,
} from './db-accessors'
// Genesis helpers
export {
  createGenesisBlock,
  genGenesisStateRoot,
  getGenesisConfig,
  getGenesisStateRoot,
  isValidGenesisBlock,
} from './genesis-helpers'
// Pure getters for config and state
export {
  getChainId,
  getConsensus,
  getConsensusAlgorithm,
  getConsensusType,
  getHardforkBlock,
  getHardforkForBlock,
  getParamAtHardfork,
  isEIPActiveAtBlock,
  isHardforkGte,
  isProofOfAuthority,
  isProofOfStake,
  isProofOfWork,
  resolveHardfork,
  shouldValidateConsensus,
} from './getters'
// Validation helpers
export {
  createHeaderValidationContext,
  createUncleValidationContext,
  type HeaderValidationContext,
  type UncleValidationContext,
  validateBlock,
  validateCanConnect,
  validateHeader,
  validateUncleHeaders,
} from './validation-helpers'

