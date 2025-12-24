import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Registry } from 'prom-client'
import { RegistryMetricCreator } from '../utils/registryMetricCreator'

export type HealthCheckFn = () => Promise<{
  healthy: boolean
  ready: boolean
  live: boolean
  details?: Record<string, unknown>
}>

export type HttpMetricsServerOpts = {
  port: number
  address?: string
  healthCheck?: HealthCheckFn
}

export type HttpMetricsServer = {
  close(): Promise<void>
}

enum RequestStatus {
  success = 'success',
  error = 'error',
}

/**
 * Simple error wrapper utility
 */
async function wrapError<T>(
  promise: Promise<T>,
): Promise<{ err?: Error; result?: T }> {
  try {
    const result = await promise
    return { result }
  } catch (err) {
    return { err: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Simple socket tracker for metrics server
 */
class SimpleSocketTracker {
  private sockets = new Set<http.ServerResponse>()
  private metrics: {
    activeSockets: ReturnType<RegistryMetricCreator['gauge']>
    socketsBytesRead: ReturnType<RegistryMetricCreator['gauge']>
    socketsBytesWritten: ReturnType<RegistryMetricCreator['gauge']>
  }

  constructor(
    server: http.Server,
    metrics: {
      activeSockets: ReturnType<RegistryMetricCreator['gauge']>
      socketsBytesRead: ReturnType<RegistryMetricCreator['gauge']>
      socketsBytesWritten: ReturnType<RegistryMetricCreator['gauge']>
    },
  ) {
    this.metrics = metrics

    server.on('connection', (socket) => {
      this.sockets.add(socket as unknown as http.ServerResponse)
      this.updateMetrics()

      socket.on('close', () => {
        this.sockets.delete(socket as unknown as http.ServerResponse)
        this.updateMetrics()
      })
    })
  }

  private updateMetrics(): void {
    this.metrics.activeSockets.set(this.sockets.size)
  }

  async terminate(): Promise<void> {
    // Close all active sockets
    const closePromises = Array.from(this.sockets).map(
      (socket) =>
        new Promise<void>((resolve) => {
          if (!socket.destroyed) {
            socket.destroy()
          }
          resolve()
        }),
    )
    await Promise.all(closePromises)
    this.sockets.clear()
    this.updateMetrics()
  }
}

export async function getHttpMetricsServer(
  opts: HttpMetricsServerOpts,
  {
    register,
    getOtherMetrics = async () => [],
  }: { register: Registry; getOtherMetrics?: () => Promise<string[]> },
): Promise<HttpMetricsServer> {
  // New registry to metric the metrics. Using the same registry would deadlock the .metrics promise
  const httpServerRegister = new RegistryMetricCreator()

  const scrapeTimeMetric = httpServerRegister.histogram<{
    status: RequestStatus
  }>({
    name: 'eth_metrics_scrape_seconds',
    help: 'Metrics server async time to scrape metrics',
    labelNames: ['status'],
    buckets: [0.1, 1, 10],
  })

  const server = http.createServer(async function onRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url?.split('?')[0] // Remove query params

    // Health endpoints
    if (req.method === 'GET' && url === '/health') {
      const healthCheck = opts.healthCheck
      if (healthCheck) {
        const healthRes = await wrapError(healthCheck())
        if (healthRes.err) {
          res.writeHead(500, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: 'error',
              error: healthRes.err.message,
            }),
          )
        } else {
          const { healthy, details } = healthRes.result ?? {
            healthy: false,
          }
          const statusCode = healthy ? 200 : 503
          res.writeHead(statusCode, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: healthy ? 'healthy' : 'unhealthy',
              ...details,
            }),
          )
        }
      } else {
        // Default health check - server is running
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ status: 'healthy' }))
      }
      return
    }

    if (req.method === 'GET' && url === '/ready') {
      const healthCheck = opts.healthCheck
      if (healthCheck) {
        const healthRes = await wrapError(healthCheck())
        if (healthRes.err) {
          res.writeHead(500, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: 'error',
              error: healthRes.err.message,
            }),
          )
        } else {
          const { ready, details } = healthRes.result ?? { ready: false }
          const statusCode = ready ? 200 : 503
          res.writeHead(statusCode, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: ready ? 'ready' : 'not_ready',
              ...details,
            }),
          )
        }
      } else {
        // Default ready check - server is running
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ status: 'ready' }))
      }
      return
    }

    if (req.method === 'GET' && url === '/live') {
      const healthCheck = opts.healthCheck
      if (healthCheck) {
        const healthRes = await wrapError(healthCheck())
        if (healthRes.err) {
          res.writeHead(500, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: 'error',
              error: healthRes.err.message,
            }),
          )
        } else {
          const { live, details } = healthRes.result ?? { live: false }
          const statusCode = live ? 200 : 503
          res.writeHead(statusCode, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              status: live ? 'alive' : 'dead',
              ...details,
            }),
          )
        }
      } else {
        // Default liveness check - server is running
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ status: 'alive' }))
      }
      return
    }

    // Metrics endpoint
    if (req.method === 'GET' && url === '/metrics') {
      const timer = scrapeTimeMetric.startTimer({
        status: RequestStatus.success,
      })
      const metricsRes = await wrapError(register.metrics())
      if (metricsRes.err) {
        // Create a new timer for error case
        const errorTimer = scrapeTimeMetric.startTimer({
          status: RequestStatus.error,
        })
        errorTimer()
      } else {
        timer()
      }

      // Ensure we only writeHead once
      if (metricsRes.err) {
        res
          .writeHead(500, { 'content-type': 'text/plain' })
          .end(metricsRes.err.stack)
      } else {
        // Get scrape time metrics
        const httpServerMetrics = await httpServerRegister.metrics()
        const otherMetrics = await getOtherMetrics()
        const metrics = [metricsRes.result, httpServerMetrics, ...otherMetrics]
        const metricsStr = metrics.join('\n\n')
        res
          .writeHead(200, { 'content-type': register.contentType })
          .end(metricsStr)
      }
      return
    }

    // 404 for unknown routes
    res.writeHead(404).end()
  })

  const socketsMetrics = {
    activeSockets: httpServerRegister.gauge({
      name: 'eth_metrics_server_active_sockets_count',
      help: 'Metrics server current count of active sockets',
    }),
    socketsBytesRead: httpServerRegister.gauge({
      name: 'eth_metrics_server_sockets_bytes_read_total',
      help: 'Metrics server total count of bytes read on all sockets',
    }),
    socketsBytesWritten: httpServerRegister.gauge({
      name: 'eth_metrics_server_sockets_bytes_written_total',
      help: 'Metrics server total count of bytes written on all sockets',
    }),
  }

  const activeSockets = new SimpleSocketTracker(server, socketsMetrics as any)

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err) => {
      console.error('Error starting metrics HTTP server', opts, err)
      reject(err)
    })
    server.listen(opts.port, opts.address, () => {
      const { port, address: host, family } = server.address() as AddressInfo
      const address = `http://${family === 'IPv6' ? `[${host}]` : host}:${port}`
      console.log('Started metrics HTTP server', { address })
      resolve()
    })
  })

  return {
    async close(): Promise<void> {
      // Gracefully close all active sockets
      await activeSockets.terminate()

      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })

      // Metrics HTTP server closed
    },
  }
}
