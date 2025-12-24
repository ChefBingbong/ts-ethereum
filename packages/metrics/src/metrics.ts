import { Metric, Registry } from 'prom-client'
import { ChainMetrics, createChainMetrics } from './metrics/chain'
import { createErrorMetrics, ErrorMetrics } from './metrics/errors'
import {
  createExecutionMetrics,
  ExecutionMetrics,
} from './metrics/execution'
import { createMinerMetrics, MinerMetrics } from './metrics/miner'
import { createNetworkMetrics, NetworkMetrics } from './metrics/network'
import { createPrometheusMetrics } from './metrics/prometheus'
import { createRPCMetrics, RPCMetrics } from './metrics/rpc'
import { createSyncMetrics, SyncMetrics } from './metrics/sync'
import { createSystemMetrics, SystemMetrics } from './metrics/system'
import { createTxPoolMetrics, TxPoolMetrics } from './metrics/txPool'
import { collectNodeJSMetrics } from './nodeJsMetrics'
import { MetricsOptions } from './options'
import { RegistryMetricCreator } from './utils/registryMetricCreator'

export type Metrics = {
  chain: ChainMetrics
  network: NetworkMetrics
  execution: ExecutionMetrics
  sync: SyncMetrics
  txPool: TxPoolMetrics
  miner: MinerMetrics
  system: SystemMetrics
  rpc: RPCMetrics
  errors: ErrorMetrics
  register: RegistryMetricCreator
  prometheus: ReturnType<typeof createPrometheusMetrics>
  close: () => void
}

export function createMetrics(
  opts: MetricsOptions,
  externalRegistries: Registry[] = [],
): Metrics {
  const register = new RegistryMetricCreator()
  const chain = createChainMetrics(register)
  const network = createNetworkMetrics(register)
  const execution = createExecutionMetrics(register)
  const sync = createSyncMetrics(register)
  const txPool = createTxPoolMetrics(register)
  const miner = createMinerMetrics(register)
  const system = createSystemMetrics(register)
  const rpc = createRPCMetrics(register)
  const errors = createErrorMetrics(register)
  const prometheus = createPrometheusMetrics(register)

  // Set metadata if provided
  if (opts.metadata) {
    register.static({
      name: 'eth_node_version',
      help: 'Node version information',
      value: opts.metadata,
    })
  }

  const close = collectNodeJSMetrics(register, opts.prefix)

  // Merge external registries
  for (const externalRegister of externalRegistries) {
    for (const metric of externalRegister.getMetricsAsArray()) {
      register.registerMetric(metric as unknown as Metric<string>)
    }
  }

  return {
    chain,
    network,
    execution,
    sync,
    txPool,
    miner,
    system,
    rpc,
    errors,
    register,
    prometheus,
    close,
  }
}
