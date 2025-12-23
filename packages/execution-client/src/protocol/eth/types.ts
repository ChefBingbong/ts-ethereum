import type { RLPxConnection } from '@ts-ethereum/p2p'
import type { Chain } from '../../blockchain'
import type { Config } from '../../config'
import type { VMExecution } from '../../execution'

/**
 * ETH Protocol Handler Options
 */
export interface EthHandlerOptions {
  config: Config
  chain: Chain
  execution: VMExecution
  rlpxConnection: RLPxConnection
}

/**
 * ETH Status message
 */
export interface EthStatus {
  chainId: bigint
  td: bigint
  bestHash: Uint8Array
  genesisHash: Uint8Array
  forkId?: [Uint8Array, Uint8Array] // [forkHash, nextFork]
}

/**
 * Request resolver for async request/response matching
 */
export interface RequestResolver {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}
