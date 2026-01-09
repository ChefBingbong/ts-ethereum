import type { HealthCheckFn, HttpMetricsServer } from '@ts-ethereum/metrics'
import { getHttpMetricsServer } from '@ts-ethereum/metrics'
import type { P2PNode as P2PNodeType } from '@ts-ethereum/p2p'
import {
  bytesToUnprefixedHex,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  randomBytes,
} from '@ts-ethereum/utils'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Chain } from '../blockchain/index'
import type { Config } from '../config/index'
import { ExecutionService } from '../execution/execution-service'
import { VMExecution } from '../execution/vmexecution'
import { NetworkService } from '../net/network-service'
import type { Peer } from '../net/peer/peer'
import {
  ENGINE_API_DEFAULT_PORT,
  EngineRpcServer,
  RpcServer,
} from '../rpc/server/index'
import { BeaconSynchronizer, FullSynchronizer } from '../sync'
import { TxFetcher } from '../sync/fetcher/txFetcher'
import { Event } from '../types'
import type { V8Engine } from '../util/index'
import { getV8Engine } from '../util/index'
import { createP2PNodeFromConfig } from './createP2pNode'
import type { ExecutionNodeInitOptions, ExecutionNodeModules } from './types'

function parseJwtSecret(config: Config, jwtFilePath?: string): Uint8Array {
  let jwtSecret: Uint8Array
  const defaultJwtPath = `${config.options.datadir}/jwtsecret`
  const usedJwtPath = jwtFilePath ?? defaultJwtPath

  // If jwtFilePath is provided, it should exist
  if (jwtFilePath !== undefined && !existsSync(jwtFilePath)) {
    throw EthereumJSErrorWithoutCode(
      `No file exists at provided jwt secret path=${jwtFilePath}`,
    )
  }

  if (jwtFilePath !== undefined || existsSync(defaultJwtPath)) {
    const jwtSecretContents = readFileSync(
      jwtFilePath ?? defaultJwtPath,
      'utf-8',
    ).trim()
    const hexPattern = new RegExp(/^(0x|0X)?(?<jwtSecret>[a-fA-F0-9]+)$/, 'g')
    const jwtSecretHex = hexPattern.exec(jwtSecretContents)?.groups?.jwtSecret
    if (jwtSecretHex === undefined || jwtSecretHex.length !== 64) {
      throw Error('Need a valid 256 bit hex encoded secret')
    }
    jwtSecret = hexToBytes(`0x${jwtSecretHex}`)
  } else {
    const folderExists = existsSync(config.options.datadir)
    if (!folderExists) {
      mkdirSync(config.options.datadir, { recursive: true })
    }

    jwtSecret = randomBytes(32)
    writeFileSync(defaultJwtPath, bytesToUnprefixedHex(jwtSecret), {})
    config.logger?.info(
      `New Engine API JWT token created path=${defaultJwtPath}`,
    )
  }
  config.logger?.info(
    `Using Engine API with JWT token authentication path=${usedJwtPath}`,
  )
  return jwtSecret
}
export const STATS_INTERVAL = 1000 * 30 // 30 seconds
export const MEMORY_SHUTDOWN_THRESHOLD = 92

export type ProtocolMessage = {
  message: { name: string; data: unknown }
  protocol: string
  peer: Peer
}

export class ExecutionNode {
  public config: Config
  public chain: Chain
  public network: NetworkService
  public execution: ExecutionService
  public txFetcher: TxFetcher
  public p2pNode: P2PNodeType
  public rpcServer?: RpcServer
  public engineRpcServer?: EngineRpcServer
  public isRpcReady: boolean

  public opened: boolean
  public running: boolean
  public interval: number
  public timeout: number
  public name: string
  public protocols: string[]

  protected v8Engine?: V8Engine
  protected statsInterval: NodeJS.Timeout | undefined
  protected statsCounter = 0
  private building = false
  private started = false
  protected metricsServer?: HttpMetricsServer
  private startTime = Date.now()
  private jwtSecret?: string

  public static async init(
    options: ExecutionNodeInitOptions,
  ): Promise<ExecutionNode> {
    const chain = await Chain.create(options)

    // Create P2P node first (needed for NetworkService)
    const bootnodes = options.config.options.bootnodes ?? []
    console.log('bootnodes', bootnodes)
    const p2pNode = createP2PNodeFromConfig({
      ...options.config.options,
      accounts: [...options.config.options.accounts],
      bootnodes: [...bootnodes],
    } as any)

    // Create Execution first (needed for NetworkService protocol handlers)
    const execution = new VMExecution({
      config: options.config,
      stateDB: options.stateDB,
      metaDB: options.metaDB,
      chain,
    })

    // Create NetworkService (needs Chain and Execution for protocol handlers)
    const network = await NetworkService.init({
      config: options.config,
      node: p2pNode,
      chain,
      execution,
    })

    // Create ExecutionService (receives NetworkCore via dependency injection)
    const executionService = await ExecutionService.init({
      config: options.config,
      chain,
      execution,
      networkCore: network.core,
      stateDB: options.stateDB,
      metaDB: options.metaDB,
    })

    // Set handler context for protocol message routing
    // Extract synchronizer with proper type narrowing
    const synchronizer = executionService.synchronizer
    const fullSynchronizer =
      synchronizer instanceof FullSynchronizer ? synchronizer : undefined
    const beaconSynchronizer =
      synchronizer instanceof BeaconSynchronizer ? synchronizer : undefined

    network.setHandlerContext({
      chain,
      txPool: executionService.txPool,
      synchronizer: fullSynchronizer,
      beaconSynchronizer,
      execution,
      networkCore: network.core,
    })

    const txFetcher = new TxFetcher({
      config: options.config,
      pool: network.core,
      txPool: executionService.txPool,
    })

    const node = new ExecutionNode({
      config: options.config,
      chain,
      network,
      execution: executionService,
      txFetcher: txFetcher,
      p2pNode,
    })

    // Initialize metrics if enabled
    if (options.config.options.metrics?.enabled !== false) {
      const metricsOptions = options.config.options.metrics
      const port = (node.config.options.port ?? 0) + 500
      // Use extIP for metrics binding (0.0.0.0 for Docker accessibility)
      const address =
        metricsOptions?.host ??
        metricsOptions?.address ??
        options.config.options.extIP ??
        '0.0.0.0'

      // Create health check function
      const healthCheck: HealthCheckFn = async () => {
        const isRunning = node.running
        const isChainInitialized = node.chain !== undefined
        const isExecutionRunning = node.execution?.execution?.started ?? false
        const isNetworkRunning = node.network !== undefined
        const isRpcReady = node.isRpcReady
        const peerCount = node.peerCount()

        // Health: basic check - node is running
        const healthy = isRunning && isChainInitialized

        // Ready: node is fully operational and ready to serve requests
        const ready =
          isRunning &&
          isChainInitialized &&
          isExecutionRunning &&
          isNetworkRunning &&
          isRpcReady

        // Live: node process is alive (always true if server is responding)
        const live = isRunning

        return {
          healthy,
          ready,
          live,
          details: {
            running: isRunning,
            chainInitialized: isChainInitialized,
            executionRunning: isExecutionRunning,
            networkRunning: isNetworkRunning,
            rpcReady: isRpcReady,
            peerCount,
            uptime: Math.floor((Date.now() - node.startTime) / 1000),
          },
        }
      }

      const metricsServer = await getHttpMetricsServer(
        {
          port,
          address,
          healthCheck,
        },
        {
          register: options.config.metrics?.register as any,
          getOtherMetrics: async () => [],
        },
      )
      node.metricsServer = metricsServer
    }

    if (node.running) return node
    void node.execution.synchronizer?.start()

    if (!node.v8Engine) {
      node.v8Engine = (await getV8Engine()) ?? undefined
    }

    node.statsInterval = setInterval(node.stats.bind(node), STATS_INTERVAL)

    node.running = true
    node.execution.miner?.start()

    await node.execution.execution.start()
    await node.execution.execution.run()

    void node.buildHeadState()
    node.txFetcher.start()
    await node.p2pNode.start()

    // Use extIP for RPC binding (0.0.0.0 for Docker accessibility)
    const rpcAddress = options.config.options.extIP ?? '0.0.0.0'
    const rpcServer = new RpcServer(
      {
        enabled: true,
        address: rpcAddress,
        port: (options.config.options.port ?? 0) + 300,
        cors: '*',
        debug: false,
        stacktraces: false,
      },
      {
        logger: node.config.options.logger!,
        node,
      },
    )

    const onRpcReady = async () => {
      await rpcServer.listen()
      node.rpcServer = rpcServer
      node.isRpcReady = true
      node.config.events.off(Event.SYNC_SYNCHRONIZED, onRpcReady)
    }

    await rpcServer.listen()
    node.rpcServer = rpcServer
    node.isRpcReady = true

    // Start Engine RPC server if enabled
    if (options.config.options.rpcEngine) {
      await node.startEngineRpcServer(options)
    }

    return node
  }

  /**
   * Start the Engine API RPC server for consensus client communication.
   * Handles JWT secret generation/loading and server initialization.
   */
  private async startEngineRpcServer(
    options: ExecutionNodeInitOptions,
  ): Promise<void> {
    const opts = options.config.options

    this.jwtSecret = parseJwtSecret(this.config) as unknown as string

    // Create and start Engine RPC server
    const engineRpcServer = new EngineRpcServer(
      {
        enabled: true,
        address: opts.rpcEngineAddr ?? '127.0.0.1',
        port: opts.rpcEnginePort ?? ENGINE_API_DEFAULT_PORT,
        jwtSecret: this.jwtSecret,
        jwtAuth: opts.rpcEngineAuth !== false,
        debug: false,
        stacktraces: false,
      },
      {
        logger: this.config.options.logger!,
        node: this,
      },
    )

    await engineRpcServer.listen()
    this.engineRpcServer = engineRpcServer

    // Log connection info for the consensus client
    const port = opts.rpcEnginePort ?? ENGINE_API_DEFAULT_PORT
    const addr = opts.rpcEngineAddr ?? '127.0.0.1'
    this.config.logger?.info(
      `\n` +
        `${'='.repeat(60)}\n` +
        `Engine API server ready for consensus client connection\n` +
        `  URL:        http://${addr}:${port}\n` +
        `  JWT Auth:   ${opts.rpcEngineAuth !== false ? 'enabled' : 'DISABLED'}\n` +
        (opts.jwtSecret
          ? `  JWT Secret: ${opts.jwtSecret}\n`
          : `  JWT Secret: (ephemeral - not persisted)\n`) +
        `${'='.repeat(60)}\n`,
    )
  }

  protected constructor(modules: ExecutionNodeModules) {
    this.config = modules.config
    this.chain = modules.chain
    this.network = modules.network
    this.execution = modules.execution
    this.txFetcher = modules.txFetcher
    this.p2pNode = modules.p2pNode

    this.name = 'eth'
    this.protocols = []
    this.opened = false
    this.running = false
    this.interval = 200
    this.timeout = 6000
    this.isRpcReady = false
    this.startTime = Date.now()

    this.config.events.on(Event.CLIENT_SHUTDOWN, async () => {
      if (this.rpcServer !== undefined) return
      await this.close()
    })

    // Setup metrics event listeners
    this.setupMetricsListeners()

    this.setHandlerContext()

    // Update sync state if synchronizer is available
    if (this.synchronizer) {
      this.synchronizer.updateSynchronizedState(
        this.chain.headers.latest ?? undefined,
        true,
      )
    }
    this.execution.txPool.checkRunState()
  }

  private setupMetricsListeners(): void {
    if (!this.config.metrics) return

    this.config.events.on(Event.CHAIN_UPDATED, () => {
      this.config.updateChainMetrics(this.chain)
    })

    this.config.events.on(Event.PEER_CONNECTED, () => {
      this.config.metrics?.network?.peerConnections?.inc({
        direction: 'inbound',
      })
      this.config.updateNetworkMetrics(this.network)
    })

    this.config.events.on(Event.PEER_DISCONNECTED, () => {
      this.config.metrics?.network?.peerDisconnections?.inc()
      this.config.updateNetworkMetrics(this.network)
    })

    this.config.events.on(Event.POOL_PEER_BANNED, () => {
      this.config.metrics?.network?.peerBans?.inc()
      this.config.updateNetworkMetrics(this.network)
    })

    // Sync events
    this.config.events.on(Event.SYNC_SYNCHRONIZED, () => {
      this.config.metrics?.sync?.syncStatus?.set(0)
      this.config.updateSyncMetrics(this.chain)
    })

    this.config.events.on(Event.SYNC_FETCHED_BLOCKS, () => {
      this.config.metrics?.sync?.blocksFetched?.inc()
    })

    this.config.events.on(Event.SYNC_ERROR, () => {
      this.config.metrics?.sync?.syncErrors?.inc({ error_type: 'sync_error' })
    })

    this.config.events.on(Event.SYNC_FETCHER_ERROR, () => {
      this.config.metrics?.sync?.fetcherErrors?.inc()
    })

    // Protocol events
    this.config.events.on(Event.PROTOCOL_MESSAGE, (message) => {
      this.config.metrics?.network?.protocolMessages?.inc({
        protocol: message.protocol,
        message_type: message.message.name,
      })
    })

    this.config.events.on(Event.PROTOCOL_ERROR, () => {
      this.config.metrics?.network?.protocolErrors?.inc({
        protocol: 'eth',
        error_type: 'protocol_error',
      })
    })

    // Chain reorg
    this.config.events.on(Event.CHAIN_REORG, () => {
      this.config.metrics?.chain?.reorgsDetected?.inc()
    })
  }

  private setHandlerContext(): void {
    const synchronizer = this.execution.synchronizer
    const handlerContext = {
      chain: this.chain,
      txPool: this.execution.txPool,
      synchronizer:
        synchronizer instanceof FullSynchronizer ? synchronizer : undefined,
      beaconSynchronizer:
        synchronizer instanceof BeaconSynchronizer ? synchronizer : undefined,
      execution: this.execution.execution,
      networkCore: this.network.core,
    }

    this.network.setHandlerContext(handlerContext)
  }

  async stop(): Promise<boolean> {
    try {
      if (!this.running) return false
      this.config.events.emit(Event.CLIENT_SHUTDOWN)
      clearInterval(this.statsInterval)

      await this.metricsServer?.close()
      await this.rpcServer?.close?.()
      await this.engineRpcServer?.close?.()
      await this.execution.stop()
      await this.network.stop()
      this.txFetcher.stop()
      this.running = false
      this.isRpcReady = false
      return true
    } catch {
      this.running = false
      return false
    }
  }

  async close(): Promise<boolean> {
    try {
      if (!this.opened) return false
      await this.execution.close()
      await this.network.close()
      this.txFetcher.stop()
      this.opened = false
      this.running = false
      this.isRpcReady = false
      return true
    } catch {
      this.opened = false
      return false
    }
  }

  async buildHeadState(): Promise<void> {
    try {
      if (this.building) return
      this.building = true

      if (!this.execution.execution.started) return
      await this.execution.synchronizer.runExecution()
    } catch {
      // Ignore errors during head state building
    } finally {
      this.building = false
    }
  }

  protected stats() {
    if (!this.v8Engine) return

    const heapStats = this.v8Engine.getHeapStatistics()
    const { used_heap_size, heap_size_limit } = heapStats

    const percentage = Math.round((100 * used_heap_size) / heap_size_limit)
    if (this.statsCounter % 4 === 0) this.statsCounter = 0

    // Update metrics
    if (this.config.metrics) {
      this.config.metrics.system.memoryUsage.set(used_heap_size)
      this.config.metrics.system.memoryLimit.set(heap_size_limit)
      this.config.metrics.system.uptime.set(
        Math.floor((Date.now() - this.startTime) / 1000),
      )
      this.config.metrics.system.nodeStatus.set(this.running ? 1 : 0)
      this.config.updateChainMetrics(this.chain)
      this.config.updateNetworkMetrics(this.network)
      this.config.updateSyncMetrics(this.chain)
    }

    if (percentage >= MEMORY_SHUTDOWN_THRESHOLD && !this.config.shutdown) {
      process.kill(process.pid, 'SIGINT')
    }
    this.statsCounter += 1
  }

  public peers = () => {
    return this.network.core.getConnectedPeers().map((p) => p.id)
  }

  public node = () => this.p2pNode
  public server = () => this.p2pNode
  public peerCount = () => this.network.core.getPeerCount()

  public get txPool() {
    return this.execution.txPool
  }

  public get miner() {
    return this.execution.miner
  }

  public get synchronizer() {
    return this.execution.synchronizer
  }
}
