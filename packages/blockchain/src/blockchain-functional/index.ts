/**
 * Functional blockchain implementation.
 *
 * Architecture follows the "functional core, imperative shell" pattern:
 *
 * 1. **Frozen Data Types** - Immutable configuration (`FrozenBlockchainConfig`)
 * 2. **Pure Helper Functions** - Stateless operations that take all dependencies as args
 * 3. **Manager Interface** - Stateful wrapper holding DB, heads, events
 *
 * Example usage:
 * ```typescript
 * import { createBlockchainManager } from '@ts-ethereum/blockchain'
 *
 * const blockchain = await createBlockchainManager({
 *   hardforkManager: myHardforkManager,
 *   validateBlocks: true,
 * })
 *
 * await blockchain.putBlock(block)
 * const head = await blockchain.getCanonicalHeadBlock()
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  BlockchainConfigContext,
  // Helper context types
  BlockchainDBContext,
  BlockchainEvent,
  BlockchainManager,
  BlockchainMutableState,
  CommonAncestorResult,
  // Consensus types
  Consensus,
  ConsensusDict,
  ConsensusOptions,
  // Factory options
  CreateBlockchainOptions,
  // Core types
  FrozenBlockchainConfig,
  OnBlock,
  PutBlockResult,
  SaveHeadOpsParams,
} from './types'

// ============================================================================
// Manager Factory Functions (Primary API)
// ============================================================================

export {
  createBlockchainManager,
  createBlockchainManagerFromBlocksData,
  createBlockchainManagerFromConfig,
  createBlockchainManagerFromJsonRpcBlocks,
} from './creators'

// ============================================================================
// Pure Helper Functions
// ============================================================================

// DB Accessors
// Validation helpers
// Chain helpers
// Genesis helpers
// Configuration getters
export {
  type ChainOperationContext,
  createDeleteBlockOps,
  createDeleteBodyOp,
  createDeleteCanonicalChainOps,
  createDeleteChildOps,
  createDeleteHashToNumberOp,
  createDeleteHeaderOp,
  createDeleteNumberToHashOp,
  createDeleteTDOp,
  createGenesisBlock,
  createHeaderValidationContext,
  createRebuildCanonicalOps,
  createSaveHeadOps,
  createSaveLookupOps,
  createSetBlockOrHeaderOps,
  createSetHashToNumberOp,
  createSetTDOp,
  createUncleValidationContext,
  DBOp,
  DBTarget,
  type DeleteCanonicalResult,
  executeBatch,
  findCommonAncestor,
  genGenesisStateRoot,
  getBlock,
  getCanonicalHeader,
  getChainId,
  getConsensus,
  getConsensusAlgorithm,
  getConsensusType,
  getGenesisConfig,
  getGenesisStateRoot,
  getHardforkBlock,
  getHardforkForBlock,
  getHeadBlock,
  getHeader,
  getHeaderByHash,
  getHeadHeader,
  getHeads,
  getParamAtHardfork,
  getTotalDifficulty,
  type HeaderValidationContext,
  hashToNumber,
  isEIPActiveAtBlock,
  isHardforkGte,
  isProofOfAuthority,
  isProofOfStake,
  isProofOfWork,
  isValidGenesisBlock,
  numberToHash,
  type RebuildCanonicalResult,
  resolveHardfork,
  safeNumberToHash,
  shouldValidateConsensus,
  type UncleValidationContext,
  validateBlock,
  validateCanConnect,
  validateHeader,
  validateUncleHeaders,
} from './helpers'

