/**
 * Shared test utilities for sanity check scripts
 */

import type { EventEmitter } from 'node:events'

export interface CheckResult {
  name: string
  passed: boolean
  duration?: number
  details: string[]
  error?: string
}

/**
 * Wait for an event to be emitted with timeout
 */
export function waitForEvent<T = unknown>(
  emitter: EventEmitter | { on: (event: string, cb: (arg: T) => void) => void },
  eventName: string,
  timeoutMs: number,
  predicate?: (arg: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timeout waiting for event '${eventName}' after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    const handler = (arg: T) => {
      if (!predicate || predicate(arg)) {
        clearTimeout(timeout)
        resolve(arg)
      }
    }

    if ('on' in emitter && typeof emitter.on === 'function') {
      emitter.on(eventName, handler)
    }
  })
}

/**
 * Wait for a condition to be true with polling
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  pollIntervalMs = 100,
  description = 'condition',
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const result = await condition()
    if (result) return
    await sleep(pollIntervalMs)
  }

  throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`)
}

/**
 * Run a check with timeout and return result
 */
export async function runCheck(
  name: string,
  checkFn: () => Promise<{ passed: boolean; details: string[] }>,
  timeoutMs = 30000,
): Promise<CheckResult> {
  const startTime = Date.now()

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Check timed out after ${timeoutMs}ms`)),
        timeoutMs,
      )
    })

    const result = await Promise.race([checkFn(), timeoutPromise])
    const duration = Date.now() - startTime

    return {
      name,
      passed: result.passed,
      duration,
      details: result.details,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      name,
      passed: false,
      duration,
      details: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Format check result for console output
 */
export function formatCheckResult(
  result: CheckResult,
  index: number,
  total: number,
): string {
  const status = result.passed ? '✓ PASS' : '✗ FAIL'
  const duration = result.duration
    ? `  (${(result.duration / 1000).toFixed(1)}s)`
    : ''
  const dots = '.'.repeat(Math.max(1, 30 - result.name.length))

  let output = `[${index}/${total}] ${result.name}${dots} ${status}${duration}\n`

  for (const detail of result.details) {
    output += `      - ${detail}\n`
  }

  if (result.error) {
    output += `      ERROR: ${result.error}\n`
  }

  return output
}

/**
 * Print final summary
 */
export function printSummary(results: CheckResult[], totalTime: number): void {
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  console.log('\n' + '='.repeat(44))
  if (failed === 0) {
    console.log(`  RESULT: ${passed}/${results.length} PASSED`)
  } else {
    console.log(
      `  RESULT: ${passed}/${results.length} PASSED, ${failed} FAILED`,
    )
  }
  console.log(`  Time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log('='.repeat(44))
}

/**
 * Truncate hex string for display
 */
export function truncateHex(hex: string, chars = 8): string {
  if (hex.length <= chars + 2) return hex
  return `${hex.slice(0, chars + 2)}...`
}
