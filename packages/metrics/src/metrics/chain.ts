import type { RegistryMetricCreator } from '../utils/registryMetricCreator.js'

export type ChainMetrics = ReturnType<typeof createChainMetrics>

/**
 * Create chain metrics
 */
export function createChainMetrics(register: RegistryMetricCreator) {
  return {
    blockHeight: register.gauge({
      name: 'eth_chain_block_height',
      help: 'Current block height',
    }),
    blockHash: register.gauge<{ hash: string }>({
      name: 'eth_chain_block_hash',
      help: 'Current block hash (as hex string)',
      labelNames: ['hash'],
    }),
    totalDifficulty: register.gauge({
      name: 'eth_chain_total_difficulty',
      help: 'Total difficulty of the chain',
    }),
    chainId: register.gauge({
      name: 'eth_chain_id',
      help: 'Chain ID',
    }),
    blocksProcessed: register.counter({
      name: 'eth_chain_blocks_processed_total',
      help: 'Total number of blocks processed',
    }),
    blocksImported: register.counter({
      name: 'eth_chain_blocks_imported_total',
      help: 'Total number of blocks imported',
    }),
    blockProcessingTime: register.histogram({
      name: 'eth_chain_block_processing_seconds',
      help: 'Time spent processing blocks',
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10],
    }),
    reorgsDetected: register.counter({
      name: 'eth_chain_reorgs_total',
      help: 'Total number of chain reorganizations detected',
    }),
  }
}
