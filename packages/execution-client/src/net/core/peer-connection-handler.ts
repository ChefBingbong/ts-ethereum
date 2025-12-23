import type { Connection } from '@ts-ethereum/p2p'
import { peerIdToString, RLPxConnection } from '@ts-ethereum/p2p'
import { P2PPeer } from '../peer/p2p-peer'
import type { NetworkCore } from './network-core'

export class PeerConnectionHandler {
  private readonly core: NetworkCore
  private readonly connection: Connection
  private readonly rlpxConnection: RLPxConnection
  private readonly peerIdHex: string

  constructor(
    core: NetworkCore,
    connection: Connection,
    rlpxConnection: RLPxConnection,
  ) {
    this.core = core
    this.connection = connection
    this.rlpxConnection = rlpxConnection
    this.peerIdHex = peerIdToString(connection.remotePeer)
  }

  async handle(): Promise<void> {
    try {
      await this.waitForProtocols()
      const peer = await this.createPeer()
      if (!peer) {
        return
      }
      await this.exchangeStatus(peer)
    } catch (error) {}
  }

  private async waitForProtocols(): Promise<void> {
    const protocols = this.rlpxConnection.getProtocols()

    if (protocols.length > 0) {
      return
    }

    return new Promise<void>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined
      let listenerAttached = false

      const cleanup = () => {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle)
          timeoutHandle = undefined
        }
        if (listenerAttached) {
          this.rlpxConnection.off('protocols:ready', onProtocolsReady)
          listenerAttached = false
        }
      }

      const onProtocolsReady = () => {
        cleanup()
        resolve()
      }

      timeoutHandle = setTimeout(() => {
        cleanup()

        const protocolsAfterDelay = this.rlpxConnection.getProtocols()
        if (protocolsAfterDelay.length > 0) {
          resolve()
        } else {
          reject(
            new Error(
              `No protocols available after timeout for peer ${this.peerIdHex.slice(0, 8)}`,
            ),
          )
        }
      }, 10000)

      listenerAttached = true
      this.rlpxConnection.once('protocols:ready', onProtocolsReady)
    })
  }

  private async createPeer(): Promise<P2PPeer | null> {
    if (
      this.core.peers.has(this.peerIdHex) ||
      this.core.pendingPeers.has(this.peerIdHex)
    ) {
      return null
    }

    if (this.core.getPeerCount() >= this.core.config.options.maxPeers) {
      return null
    }

    let peer: P2PPeer
    try {
      peer = new P2PPeer({
        config: this.core.config,
        connection: this.connection,
        rlpxConnection: this.rlpxConnection,
        inbound: this.connection.direction === 'inbound',
        chain: this.core.chain,
        execution: this.core.execution,
        handlerContext: this.core.handlerContext,
      })
    } catch (error) {
      return null
    }

    if (!peer.eth) {
      return null
    }

    return peer
  }

  private async exchangeStatus(peer: P2PPeer): Promise<void> {
    this.core.pendingPeers.set(this.peerIdHex, peer)

    try {
      await this.core.waitForPeerStatus(peer, this.peerIdHex)
      await this.core.sendStatusToPeer(
        peer,
        this.rlpxConnection,
        this.peerIdHex,
      )
    } catch (error) {
      this.core.pendingPeers.delete(this.peerIdHex)
      try {
        await peer.disconnect()
      } catch (disconnectError) {}
      throw error
    }
  }
}
