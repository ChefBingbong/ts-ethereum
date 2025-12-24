import type { RegistryMetricCreator } from '../utils/registryMetricCreator'

export type SystemMetrics = ReturnType<typeof createSystemMetrics>

/**
 * Create system metrics
 */
export function createSystemMetrics(register: RegistryMetricCreator) {
  return {
    memoryUsage: register.gauge({
      name: 'eth_system_memory_usage_bytes',
      help: 'Memory usage in bytes',
    }),
    memoryLimit: register.gauge({
      name: 'eth_system_memory_limit_bytes',
      help: 'Memory limit in bytes',
    }),
    cpuUsage: register.gauge({
      name: 'eth_system_cpu_usage_percent',
      help: 'CPU usage percentage',
    }),
    diskUsage: register.gauge<{ path: string }>({
      name: 'eth_system_disk_usage_bytes',
      help: 'Disk usage in bytes',
      labelNames: ['path'],
    }),
    uptime: register.gauge({
      name: 'eth_system_uptime_seconds',
      help: 'System uptime in seconds',
    }),
    nodeStatus: register.gauge({
      name: 'eth_system_node_status',
      help: 'Node status (1=running, 0=stopped)',
    }),
  }
}
