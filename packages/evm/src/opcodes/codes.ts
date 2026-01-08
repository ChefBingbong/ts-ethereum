import type { HardforkManager } from '@ts-ethereum/chain-config'
import { Hardfork } from '@ts-ethereum/chain-config'
import { type CustomOpcode, isAddOpcode } from '../types'
import { OpNames } from './constants'
import {
  enableEIP663,
  enableEIP1153,
  enableEIP1283,
  enableEIP2200,
  enableEIP2929,
  enableEIP3198,
  enableEIP3855,
  enableEIP4200,
  enableEIP4750,
  enableEIP4844,
  enableEIP5656,
  enableEIP6206,
  enableEIP7069,
  enableEIP7480,
  enableEIP7516,
  enableEIP7620,
  enableEIP7939,
} from './eips'
import { getJumpTableForHardfork } from './tables'
import type { JumpTable } from './types'
import { makeOperation } from './types'
import { getFullname } from './util'

export class Opcode {
  readonly code: number
  readonly name: string
  readonly fullName: string
  readonly fee: number
  readonly feeBigInt: bigint
  readonly isAsync: boolean
  readonly dynamicGas: boolean
  readonly isInvalid: boolean

  constructor({
    code,
    name,
    fullName,
    fee,
    isAsync,
    dynamicGas,
  }: {
    code: number
    name: string
    fullName: string
    fee: number
    isAsync: boolean
    dynamicGas: boolean
  }) {
    this.code = code
    this.name = name
    this.fullName = fullName
    this.fee = fee
    this.feeBigInt = BigInt(fee)
    this.isAsync = isAsync
    this.dynamicGas = dynamicGas
    this.isInvalid = this.name === 'INVALID'

    // Opcode isn't subject to change, thus all further modifications are prevented.
    Object.freeze(this)
  }
}

export type OpcodeList = Map<number, Opcode>

/**
 * Convert JumpTable to OpcodeList for public API compatibility.
 * This function derives the OpcodeList from the JumpTable, eliminating
 * the need for separate opcode definitions.
 *
 * @param jumpTable The jump table to convert
 * @returns OpcodeList suitable for public API
 */
export function jumpTableToOpcodeList(jumpTable: JumpTable): OpcodeList {
  const result: OpcodeList = new Map()

  for (let opcode = 0; opcode <= 0xff; opcode++) {
    const operation = jumpTable[opcode]

    // Skip undefined opcodes - they should not appear in the public API
    // This matches the old getOpcodesForHF behavior
    if (operation.undefined) {
      continue
    }

    // Convert Operation to Opcode
    result.set(
      opcode,
      new Opcode({
        code: opcode,
        name: operation.name || 'INVALID',
        fullName: operation.fullName || 'INVALID',
        fee: Number(operation.constantGas),
        isAsync: operation.isAsync,
        dynamicGas: operation.dynamicGas !== undefined,
      }),
    )
  }

  return result
}

/**
 * Build a JumpTable using the new architecture.
 * This function creates a jump table for the specified hardfork, applies any active EIPs,
 * and populates opcodes with names and gas costs from chain params.
 *
 * @param common HardforkManager instance
 * @param hardfork Hardfork identifier
 * @param customOpcodes Optional custom opcodes to add/override
 * @returns JumpTable with all opcodes for the hardfork
 */
export function buildJumpTable(
  common: HardforkManager,
  hardfork: string,
  customOpcodes?: CustomOpcode[],
): JumpTable {
  // Get base jump table for the hardfork
  const table = getJumpTableForHardfork(hardfork)

  // Apply gas-modifying EIPs first (they modify existing opcodes)
  // These must be applied in order, as later EIPs may supersede earlier ones
  // Note: EIP-1283, 2200, and 2929 are part of specific hardforks, not explicitly listed in HARDFORK_EIPS
  if (common.hardforkGte(hardfork, Hardfork.Istanbul)) {
    enableEIP1283(table)
  }
  // EIP-2200 supersedes EIP-1283 at Istanbul
  if (common.hardforkGte(hardfork, Hardfork.Constantinople)) {
    enableEIP2200(table)
  }
  if (common.isEIPActiveAtHardfork(2929, hardfork)) {
    enableEIP2929(table)
  }

  // Apply EIPs that add/modify opcodes
  // Core EIPs
  if (common.isEIPActiveAtHardfork(1153, hardfork)) enableEIP1153(table)
  if (common.isEIPActiveAtHardfork(3198, hardfork)) enableEIP3198(table)
  if (common.isEIPActiveAtHardfork(3855, hardfork)) enableEIP3855(table)
  if (common.isEIPActiveAtHardfork(4844, hardfork)) enableEIP4844(table)
  if (common.isEIPActiveAtHardfork(5656, hardfork)) enableEIP5656(table)
  if (common.isEIPActiveAtHardfork(7516, hardfork)) enableEIP7516(table)

  // EOF EIPs
  if (common.isEIPActiveAtHardfork(663, hardfork)) enableEIP663(table)
  if (common.isEIPActiveAtHardfork(4200, hardfork)) enableEIP4200(table)
  if (common.isEIPActiveAtHardfork(4750, hardfork)) enableEIP4750(table)
  if (common.isEIPActiveAtHardfork(6206, hardfork)) enableEIP6206(table)
  if (common.isEIPActiveAtHardfork(7069, hardfork)) enableEIP7069(table)
  if (common.isEIPActiveAtHardfork(7480, hardfork)) enableEIP7480(table)
  if (common.isEIPActiveAtHardfork(7620, hardfork)) enableEIP7620(table)
  if (common.isEIPActiveAtHardfork(7939, hardfork)) enableEIP7939(table)

  // Apply custom opcodes
  if (customOpcodes) {
    for (const customOp of customOpcodes) {
      if (!isAddOpcode(customOp)) {
        // Delete opcode
        table[customOp.opcode] = {
          opcode: customOp.opcode,
          name: 'INVALID',
          fullName: 'INVALID',
          execute: () => {
            throw new Error('Invalid opcode')
          },
          constantGas: 0n,
          minStack: 0,
          maxStack: 0,
          isAsync: false,
          undefined: true,
        }
        continue
      }

      // Add/override opcode
      table[customOp.opcode] = makeOperation({
        execute: customOp.logicFunction,
        dynamicGas: customOp.gasFunction,
        isAsync: true, // Custom opcodes are always async for safety
      })
      // Set custom opcode metadata
      table[customOp.opcode].opcode = customOp.opcode
      table[customOp.opcode].name = customOp.opcodeName
      table[customOp.opcode].fullName = customOp.opcodeName
      table[customOp.opcode].constantGas = BigInt(customOp.baseFee)
    }
  }

  // Populate opcode metadata (opcode, name, fullName, constantGas, dynamicGas)
  for (let opcode = 0; opcode <= 0xff; opcode++) {
    const op = table[opcode]

    // Set opcode number
    op.opcode = opcode

    // Skip if already has a custom name (custom opcodes)
    if (op.name && op.name !== '' && op.name !== 'INVALID') {
      continue
    }

    // Get full name from OpNames constant (e.g., 'PUSH1', 'DUP2')
    // Special case: 0x44 is DIFFICULTY pre-Paris, PREVRANDAO post-Paris (EIP-4399)
    let fullName = OpNames[opcode] ?? 'INVALID'
    let baseName: string
    if (opcode === 0x44) {
      // EIP-4399: DIFFICULTY becomes PREVRANDAO at Paris
      if (common.hardforkGte(hardfork, Hardfork.Paris)) {
        fullName = 'PREVRANDAO'
        baseName = 'PREVRANDAO'
      } else {
        fullName = 'DIFFICULTY'
        baseName = 'DIFFICULTY'
      }
      op.name = baseName
      op.fullName = fullName
    } else {
      // Get base name for gas param lookup (e.g., 'PUSH' from 'PUSH1', 'DUP' from 'DUP2')
      baseName = getBaseName(opcode, fullName)
      op.name = baseName
      op.fullName = getFullname(opcode, baseName)
    }

    // Get gas cost from chain params (only for valid opcodes)
    if (!op.undefined) {
      const gasParamName = `${baseName.toLowerCase()}Gas` as any
      const baseFee = common.getParamAtHardfork(gasParamName, hardfork)
      if (baseFee !== undefined) {
        op.constantGas = BigInt(baseFee)
      }
      // Note: Dynamic gas handlers are now wired directly in jump table files
    }
  }

  return table
}

/**
 * Get base opcode name for gas param lookup
 * Strips numeric suffixes from opcodes like PUSH1, DUP2, LOG3, etc.
 */
function getBaseName(opcode: number, fullName: string): string {
  // PUSH1-PUSH32 (0x60-0x7f)
  if (opcode >= 0x60 && opcode <= 0x7f) return 'PUSH'
  // DUP1-DUP16 (0x80-0x8f)
  if (opcode >= 0x80 && opcode <= 0x8f) return 'DUP'
  // SWAP1-SWAP16 (0x90-0x9f)
  if (opcode >= 0x90 && opcode <= 0x9f) return 'SWAP'
  // LOG0-LOG4 (0xa0-0xa4)
  if (opcode >= 0xa0 && opcode <= 0xa4) return 'LOG'
  // Default: return full name
  return fullName
}
