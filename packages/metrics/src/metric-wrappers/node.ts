import { Counter, Registry } from 'prom-client'

// Lazy-load GCProfiler to handle cases where it's not available (e.g., Bun)
let GCProfiler: any
let GCProfilerResult: any

function getGCProfiler() {
  if (GCProfiler !== undefined) {
    return GCProfiler
  }
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v8Module = require('node:v8')
    GCProfiler = v8Module.GCProfiler
    GCProfilerResult = v8Module.GCProfilerResult
  } catch {
    // GCProfiler not available (e.g., in Bun)
    GCProfiler = null
    GCProfilerResult = null
  }
  
  return GCProfiler
}

export function gcStats(
  registry: Registry,
  config: { collectionInterval: number; prefix?: string } = {
    collectionInterval: 6000,
  },
): () => void {
  // If GCProfiler is not available, return a no-op function
  const Profiler = getGCProfiler()
  if (!Profiler) {
    return () => {}
  }

  const registers = registry ? [registry] : undefined

  const labelNames = ['gctype']

  const namePrefix = config.prefix ?? ''

  const gcCount = new Counter({
    name: `${namePrefix}nodejs_gc_runs_total`,
    help: 'Count of total garbage collections.',
    labelNames,
    registers,
  })
  const gcTimeCount = new Counter({
    name: `${namePrefix}nodejs_gc_pause_seconds_total`,
    help: 'Time spent in GC Pause in seconds.',
    labelNames,
    registers,
  })
  const gcReclaimedCount = new Counter({
    name: `${namePrefix}nodejs_gc_reclaimed_bytes_total`,
    help: 'Total number of bytes reclaimed by GC.',
    labelNames,
    registers,
  })

  const profiler = new Profiler()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processGCStats = (stats: any): void => {
    const { gcType, cost, beforeGC, afterGC } = stats

    gcCount.labels(gcType).inc()
    gcTimeCount.labels(gcType).inc(cost / 1e6)

    const diffUsedHeapSize =
      afterGC.heapStatistics.usedHeapSize - beforeGC.heapStatistics.usedHeapSize
    if (diffUsedHeapSize < 0) {
      gcReclaimedCount.labels(gcType).inc(diffUsedHeapSize * -1)
    }
  }

  profiler.start()

  const interval = setInterval(() => {
    // restart the profiler to continue collecting statistics
    const result = profiler.stop()
    profiler.start()

    // then process all returned statistics
    for (const stats of result.statistics) {
      processGCStats(stats)
    }
  }, config.collectionInterval)

  return () => {
    clearInterval(interval)
    profiler.stop()
  }
}
