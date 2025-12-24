/**
 * libp2p Adapter for DPT Discovery
 *
 * This adapter makes DPTDiscovery compatible with libp2p's createLibp2p function
 * by implementing the required libp2p peer discovery interface.
 */

import { publicKeyFromRaw } from '@libp2p/crypto/keys'
import type {
  ComponentLogger,
  PeerDiscovery as Libp2pPeerDiscovery,
  PeerInfo as Libp2pPeerInfo,
  PeerDiscoveryEvents,
  Startable,
} from '@libp2p/interface'
import {
  peerDiscoverySymbol,
  serviceCapabilities,
  TypedEventEmitter,
} from '@libp2p/interface'
import type {
  AddressManager,
  ConnectionManager,
} from '@libp2p/interface-internal'
import { peerIdFromPublicKey } from '@libp2p/peer-id'
import type { PeerInfo as CustomPeerInfo } from '@ts-ethereum/p2p'
import { DPTDiscovery, type DPTDiscoveryInit } from './dpt-discovery.js'

/**
 * Components required by libp2p peer discovery modules
 */
export interface DPTDiscoveryLibp2pComponents {
  logger: ComponentLogger
  addressManager: AddressManager
  connectionManager?: ConnectionManager
}

/**
 * libp2p-compatible wrapper for DPTDiscovery
 *
 * This wrapper adapts DPTDiscovery to work with libp2p's createLibp2p by:
 * 1. Implementing libp2p's PeerDiscovery and Startable interfaces
 * 2. Converting libp2p components to DPTDiscovery's expected format
 * 3. Adding required libp2p metadata (serviceCapabilities, etc.)
 */
export class DPTDiscoveryLibp2p
  extends TypedEventEmitter<PeerDiscoveryEvents>
  implements Libp2pPeerDiscovery, Startable
{
  readonly [Symbol.toStringTag] = '@p2p/dpt-discovery-libp2p'
  readonly [peerDiscoverySymbol] = this
  readonly [serviceCapabilities]: string[] = ['@libp2p/peer-discovery']

  private readonly dptDiscovery: DPTDiscovery
  private started = false

  constructor(
    components: DPTDiscoveryLibp2pComponents,
    init: DPTDiscoveryInit,
  ) {
    super()

    // Convert libp2p components to DPTDiscovery format
    // DPTDiscovery expects a ComponentLogger and optional ConnectionManager
    const dptComponents = {
      logger: components.logger,
      connectionManager: components.connectionManager as any, // Type compatibility
    }

    // Create the underlying DPTDiscovery instance
    this.dptDiscovery = new DPTDiscovery(dptComponents, init)

    // Forward peer events from DPTDiscovery to libp2p
    this.dptDiscovery.addEventListener('peer', (evt) => {
      // Convert custom PeerInfo to libp2p PeerInfo format
      const customPeerInfo = evt.detail as CustomPeerInfo
      try {
        // Convert Uint8Array peer ID (64-byte secp256k1 public key) to libp2p PeerId
        // RLPX uses 64-byte public keys, we need to add 0x04 prefix for uncompressed format
        const fullPublicKey = new Uint8Array(65)
        fullPublicKey[0] = 0x04 // Uncompressed public key prefix
        fullPublicKey.set(customPeerInfo.id, 1)

        const publicKey = publicKeyFromRaw(fullPublicKey)
        const peerId = peerIdFromPublicKey(publicKey)

        const libp2pPeerInfo: Libp2pPeerInfo = {
          id: peerId,
          multiaddrs: customPeerInfo.multiaddrs,
        }
        // Re-emit as libp2p expects
        this.dispatchEvent(
          new CustomEvent<Libp2pPeerInfo>('peer', { detail: libp2pPeerInfo }),
        )
      } catch (err) {
        // Skip invalid peer IDs - log using logger component
        const log = components.logger.forComponent('dpt-discovery-libp2p')
        log.error('Failed to convert peer ID: %s', (err as Error).message)
      }
    })
  }

  /**
   * Check if the discovery module is started
   */
  isStarted(): boolean {
    return this.started && this.dptDiscovery.isStarted()
  }

  /**
   * Start the discovery module
   */
  async start(): Promise<void> {
    if (this.started) {
      return
    }

    await this.dptDiscovery.start()
    this.started = true
  }

  /**
   * Stop the discovery module
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    await this.dptDiscovery.stop()
    this.started = false
  }

  /**
   * Access underlying DPTDiscovery methods (for advanced usage)
   */
  getDPTDiscovery(): DPTDiscovery {
    return this.dptDiscovery
  }
}

/**
 * Factory function for creating libp2p-compatible DPT discovery
 *
 * @example
 * ```typescript
 * import { createLibp2p } from 'libp2p'
 * import { dptDiscoveryLibp2p } from './dpt-discovery-libp2p'
 *
 * const node = await createLibp2p({
 *   privateKey,
 *   peerDiscovery: [
 *     dptDiscoveryLibp2p({
 *       privateKey,
 *       bindPort: 30303,
 *       bootstrapNodes: [...],
 *     })
 *   ],
 * })
 *
 * node.addEventListener('peer:discovery', (evt) => {
 *   console.log('Discovered peer:', evt.detail.id.toString())
 * })
 * ```
 */
export function dptDiscoveryLibp2p(
  init: DPTDiscoveryInit,
): (components: DPTDiscoveryLibp2pComponents) => Libp2pPeerDiscovery {
  return (components: DPTDiscoveryLibp2pComponents) => {
    return new DPTDiscoveryLibp2p(components, init)
  }
}
