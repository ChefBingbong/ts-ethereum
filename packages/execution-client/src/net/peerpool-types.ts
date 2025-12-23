import type { Config } from '../config/index'
import { NetworkCore } from './core/network-core'
import type { Peer } from './peer/peer'

/**
 * Common interface for peer pools
 * Now only Network is supported (replaces P2PPeerPool)
 */
export interface IPeerPool {
  config: Config
  running: boolean
  peers: Peer[]
  size: number
  contains(peer: Peer | string): boolean
  idle(filterFn?: (peer: Peer) => boolean): Peer | undefined
  add(peer?: Peer): void
  remove(peer?: Peer): void
  ban(peer: Peer, maxAge?: number): void
  open(): Promise<boolean | void>
  start(): Promise<boolean>
  stop(): Promise<boolean>
  close(): Promise<void>
}

/**
 * Type alias for peer pool implementations
 * Now only Network is supported (replaces P2PPeerPool)
 */
export type PeerPoolLike = NetworkCore
