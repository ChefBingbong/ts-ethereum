/**
 * @ts-ethereum/blockchain - Functional blockchain implementation
 *
 * Architecture follows the "functional core, imperative shell" pattern:
 * - Frozen Data Types (FrozenBlockchainConfig) - immutable configuration
 * - Pure Helper Functions - stateless operations
 * - Manager Interface (BlockchainManager) - stateful wrapper
 */

// Re-export all from functional API
export * from './blockchain-functional'
// Consensus implementations
export {
  CasperConsensus,
  CliqueConsensus,
  EthashConsensus,
} from './consensus/index'
// DB helpers (for backward compatibility)
export {
  DBOp,
  DBSaveLookups,
  DBSetBlockOrHeader,
  DBSetHashToNumber,
  DBSetTD,
} from './db/helpers'
