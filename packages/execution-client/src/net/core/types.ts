import type { P2PNode } from '@ts-ethereum/p2p'
import type { Chain } from '../../blockchain/chain'
import type { Config } from '../../config/index'
import type { VMExecution } from '../../execution/index'

/**
 * Options for initializing NetworkCore
 */
export interface NetworkCoreOptions {
  /* Config */
  config: Config

  /* P2PNode instance */
  node: P2PNode

  /* Chain instance (optional, for STATUS exchange) */
  chain?: Chain

  /* VMExecution instance (optional, for ETH handler) */
  execution?: VMExecution
}
