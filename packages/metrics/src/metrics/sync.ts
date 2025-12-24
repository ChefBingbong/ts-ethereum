import type { RegistryMetricCreator } from '../utils/registryMetricCreator'

export type SyncMetrics = ReturnType<typeof createSyncMetrics>

/**
 * Create sync metrics
 */
export function createSyncMetrics(register: RegistryMetricCreator) {
  return {
    syncStatus: register.gauge({
      name: 'eth_sync_status',
      help: 'Sync status (1=syncing, 0=synced)',
    }),
    syncTargetHeight: register.gauge({
      name: 'eth_sync_target_height',
      help: 'Target sync height',
    }),
    syncCurrentHeight: register.gauge({
      name: 'eth_sync_current_height',
      help: 'Current sync height',
    }),
    blocksFetched: register.counter({
      name: 'eth_sync_blocks_fetched_total',
      help: 'Total number of blocks fetched',
    }),
    headersFetched: register.counter({
      name: 'eth_sync_headers_fetched_total',
      help: 'Total number of headers fetched',
    }),
    syncErrors: register.counter<{ error_type: string }>({
      name: 'eth_sync_errors_total',
      help: 'Total number of sync errors',
      labelNames: ['error_type'],
    }),
    fetcherJobs: register.gauge({
      name: 'eth_sync_fetcher_jobs',
      help: 'Current number of fetcher jobs',
    }),
    fetcherErrors: register.counter({
      name: 'eth_sync_fetcher_errors_total',
      help: 'Total number of fetcher errors',
    }),
    syncDuration: register.histogram({
      name: 'eth_sync_duration_seconds',
      help: 'Sync operation duration',
      buckets: [1, 5, 10, 30, 60, 300, 600],
    }),
  }
}
