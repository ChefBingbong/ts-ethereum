import { P2PNode } from '@ts-ethereum/p2p'
import type { Chain } from '../blockchain/chain'
import type { Config } from '../config/index'
import type { VMExecution } from '../execution/index'
import { Event } from '../types'
import { NetworkCore } from './core/index'
import type { Peer } from './peer/peer'
import { EthMessageCode } from './protocol/eth/definitions'
import type { EthHandlerContext } from './protocol/eth/handlers'

export interface NetworkServiceModules {
  config: Config
  node: P2PNode
  chain: Chain
  execution: VMExecution
}

export interface NetworkServiceInitOptions {
  config: Config
  node: P2PNode
  chain: Chain
  execution: VMExecution
}

export class NetworkService {
  public readonly core: NetworkCore
  public readonly config: Config
  protected handlerContext?: EthHandlerContext

  static async init(
    options: NetworkServiceInitOptions,
  ): Promise<NetworkService> {
    const core = await NetworkCore.init({
      config: options.config,
      node: options.node,
      chain: options.chain,
      execution: options.execution,
    })

    const service = new NetworkService({
      config: options.config,
      core,
    })

    return service
  }

  constructor(modules: { config: Config; core: NetworkCore }) {
    this.config = modules.config
    this.core = modules.core

    this.setupEventListeners()
  }

  setHandlerContext(context: EthHandlerContext): void {
    this.handlerContext = context
    this.core.handlerContext = context

    const peers = this.core.getConnectedPeers()
    for (const peer of peers) {
      if (peer.eth?.context) {
        peer.eth.context = context
      }
    }
  }

  private setupEventListeners(): void {
    this.config.events.on(Event.PROTOCOL_MESSAGE, this.onProtocolMessage)
  }

  private removeEventListeners(): void {
    this.config.events.off(Event.PROTOCOL_MESSAGE, this.onProtocolMessage)
  }

  private onProtocolMessage = async (message: {
    message: { name: string; data: unknown; code?: number }
    protocol: string
    peer: Peer
  }): Promise<void> => {
    try {
      if (message.protocol !== 'eth') return

      const messageCode = this.getMessageCode(
        message.message.name,
        message.message.code,
      )
      const ethHandler = this.getEthHandlerFromPeer(message.peer)
      if (!ethHandler || messageCode === undefined) return

      const handler = ethHandler.registry.getHandler(messageCode)
      if (!handler) return
      await handler(ethHandler, message.message.data)
    } catch (error) {
      const clientError = this.config.trackError(error)
      this.config.events.emit(Event.PEER_ERROR, clientError, message.peer)
    }
  }

  private getMessageCode(name: string, code?: number): number | undefined {
    if (code !== undefined) {
      return code
    }

    const nameToCode: Record<string, number> = {
      GetBlockHeaders: EthMessageCode.GET_BLOCK_HEADERS,
      GetBlockBodies: EthMessageCode.GET_BLOCK_BODIES,
      GetPooledTransactions: EthMessageCode.GET_POOLED_TRANSACTIONS,
      GetReceipts: EthMessageCode.GET_RECEIPTS,
      NewBlockHashes: EthMessageCode.NEW_BLOCK_HASHES,
      Transactions: EthMessageCode.TRANSACTIONS,
      NewBlock: EthMessageCode.NEW_BLOCK,
      NewPooledTransactionHashes: EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
    }

    return nameToCode[name]
  }

  private getEthHandlerFromPeer(peer: Peer): any | undefined {
    if ('eth' in peer) {
      return (peer as any).eth
    }
    return undefined
  }

  async stop(): Promise<boolean> {
    this.removeEventListeners()
    return await this.core.stop()
  }

  async close(): Promise<void> {
    this.removeEventListeners()
    await this.core.close()
  }

  get running(): boolean {
    return this.core.running
  }
}
