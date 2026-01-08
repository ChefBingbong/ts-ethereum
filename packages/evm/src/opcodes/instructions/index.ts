/**
 * Instructions index - exports all instruction handlers by category
 */

// Export individual instruction modules
export * from './arithmetic'
export * from './bitwise'
export * from './block'
export * from './comparison'
export * from './control'
export * from './crypto'
export * from './environment'
export * from './eof'
export * from './log'
export * from './memory'
export * from './stack'
export * from './storage'
export * from './system'

import type { ExecuteFunc } from '../types'
// Import handler maps from each module
import { arithmeticHandlers } from './arithmetic'
import { bitwiseHandlers } from './bitwise'
import { blockHandlers } from './block'
import { comparisonHandlers } from './comparison'
import { controlHandlers } from './control'
import { cryptoHandlers } from './crypto'
import { environmentHandlers } from './environment'
import { eofHandlers } from './eof'
import { logHandlers } from './log'
import { memoryHandlers } from './memory'
import { stackHandlers } from './stack'
import { storageHandlers } from './storage'
import { systemHandlers } from './system'

/**
 * All instruction handlers combined into a single map
 * This can be used to build jump tables or as a direct lookup
 */
export const allHandlers: Map<number, ExecuteFunc> = new Map([
  ...arithmeticHandlers,
  ...comparisonHandlers,
  ...bitwiseHandlers,
  ...cryptoHandlers,
  ...environmentHandlers,
  ...blockHandlers,
  ...stackHandlers,
  ...memoryHandlers,
  ...storageHandlers,
  ...controlHandlers,
  ...logHandlers,
  ...systemHandlers,
  ...eofHandlers,
])
