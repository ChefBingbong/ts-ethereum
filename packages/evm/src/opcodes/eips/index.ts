/**
 * EIP Enablers index
 * Functions to enable specific EIPs on a jump table
 */

// EOF EIPs
export { enableEIP663 } from './eip-663'
// Opcode-adding EIPs
export { enableEIP1153 } from './eip-1153'
// Core EIPs
// Gas-modifying EIPs (modify existing opcodes)
export { enableEIP1283 } from './eip-1283'
export { enableEIP2200 } from './eip-2200'
// EIP-2929 helper functions (used by dynamic gas handlers)
export {
  accessAddressEIP2929,
  accessStorageEIP2929,
  adjustSstoreGasEIP2929,
  enableEIP2929,
} from './eip-2929'
export { enableEIP3198 } from './eip-3198'
export { enableEIP3855 } from './eip-3855'
export { enableEIP4200 } from './eip-4200'
export { enableEIP4750 } from './eip-4750'
export { enableEIP4844 } from './eip-4844'
export { enableEIP5656 } from './eip-5656'
export { enableEIP6206 } from './eip-6206'
export { enableEIP7069 } from './eip-7069'
export { enableEIP7480 } from './eip-7480'
export { enableEIP7516 } from './eip-7516'
export { enableEIP7620 } from './eip-7620'
export { enableEIP7939 } from './eip-7939'

import type { JumpTable } from '../types'

/**
 * Enable all EOF-related EIPs on a jump table
 * @param table The jump table to modify
 * @returns The modified jump table
 */
export function enableAllEOF(table: JumpTable): JumpTable {
  const { enableEIP663 } = require('./eip-663')
  const { enableEIP4200 } = require('./eip-4200')
  const { enableEIP4750 } = require('./eip-4750')
  const { enableEIP6206 } = require('./eip-6206')
  const { enableEIP7069 } = require('./eip-7069')
  const { enableEIP7480 } = require('./eip-7480')
  const { enableEIP7620 } = require('./eip-7620')

  enableEIP663(table)
  enableEIP4200(table)
  enableEIP4750(table)
  enableEIP6206(table)
  enableEIP7069(table)
  enableEIP7480(table)
  enableEIP7620(table)

  return table
}
