import type { HttpMetricsServerOpts } from './server/index'

export type Metadata = {
  /** Version string, e.g., "v1.0.0" */
  version: string
  /** Git commit hash */
  commit: string
  /** Network name */
  network: string
}

export type MetricsOptions = HttpMetricsServerOpts & {
  enabled?: boolean
  /** Optional metadata to send to Prometheus */
  metadata?: Metadata
  /** Optional prefix for metric names */
  prefix?: string
  /** Optional host (alias for address) */
  host?: string
  /** Optional path for metrics endpoint */
  path?: string
  /** Whether to collect default Node.js metrics */
  collectDefaultMetrics?: boolean
}

export const defaultMetricsOptions: MetricsOptions = {
  enabled: true,
  port: 8008,
  address: '127.0.0.1',
  collectDefaultMetrics: true,
  metadata: {
    version: '0.0.1',
    commit: '0.0.1',
    network: 'testnet',
  },
  prefix: 'eth',
  path: '/metrics',
  host: '127.0.0.1',
}
