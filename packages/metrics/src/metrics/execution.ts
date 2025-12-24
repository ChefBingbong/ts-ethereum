import type { RegistryMetricCreator } from '../utils/registryMetricCreator'

export type ExecutionMetrics = ReturnType<typeof createExecutionMetrics>

/**
 * Create execution metrics
 */
export function createExecutionMetrics(register: RegistryMetricCreator) {
  return {
    vmExecutionTime: register.histogram({
      name: 'eth_execution_vm_execution_seconds',
      help: 'Time spent executing blocks in VM',
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30],
    }),
    vmErrors: register.counter<{ error_type: string }>({
      name: 'eth_execution_vm_errors_total',
      help: 'Total number of VM execution errors',
      labelNames: ['error_type'],
    }),
    vmBacksteps: register.counter({
      name: 'eth_execution_vm_backsteps_total',
      help: 'Total number of VM backsteps',
    }),
    blocksExecuted: register.counter({
      name: 'eth_execution_blocks_executed_total',
      help: 'Total number of blocks executed',
    }),
    transactionsExecuted: register.counter({
      name: 'eth_execution_transactions_executed_total',
      help: 'Total number of transactions executed',
    }),
    gasUsed: register.counter({
      name: 'eth_execution_gas_used_total',
      help: 'Total gas used',
    }),
    executionStatus: register.gauge({
      name: 'eth_execution_status',
      help: 'Execution engine status (1=running, 0=stopped)',
    }),
  }
}
