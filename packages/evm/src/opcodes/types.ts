import type { HardforkManager } from '@ts-ethereum/chain-config'
import type { RunState } from '../interpreter'

/**
 * Synchronous opcode handler
 */
export type SyncOpHandler = (
  runState: RunState,
  common: HardforkManager,
) => void

/**
 * Asynchronous opcode handler
 */
export type AsyncOpHandler = (
  runState: RunState,
  common: HardforkManager,
) => Promise<void>

/**
 * Opcode handler (sync or async)
 */
export type OpHandler = SyncOpHandler | AsyncOpHandler

/**
 * Alias for opcode execution handler (sync or async)
 */
export type ExecuteFunc = OpHandler

/**
 * Synchronous dynamic gas handler
 */
export type SyncDynamicGasHandler = (
  runState: RunState,
  gas: bigint,
  common: HardforkManager,
) => bigint

/**
 * Asynchronous dynamic gas handler
 */
export type AsyncDynamicGasHandler = (
  runState: RunState,
  gas: bigint,
  common: HardforkManager,
) => Promise<bigint>

/**
 * Dynamic gas calculation handler (sync or async)
 */
export type DynamicGasFunc = SyncDynamicGasHandler | AsyncDynamicGasHandler

/**
 * Operation struct (similar to Geth's operation)
 * Contains all information needed to execute an opcode
 */
export interface Operation {
  /** Opcode identifier (0x00-0xFF) - populated by buildJumpTable */
  opcode: number
  /** Opcode name (e.g., 'ADD', 'PUSH1') - populated by buildJumpTable */
  name: string
  /** Full opcode name with any suffix (e.g., 'PUSH1', 'LOG2') - populated by buildJumpTable */
  fullName: string
  /** The execution function for this opcode */
  execute: ExecuteFunc
  /** Constant/base gas cost for this opcode - populated by buildJumpTable from chain params */
  constantGas: bigint
  /** Optional dynamic gas calculation function */
  dynamicGas?: DynamicGasFunc
  /** Minimum stack items required */
  minStack: number
  /** Maximum stack size after execution */
  maxStack: number
  /** Whether this opcode is async */
  isAsync: boolean
  /** Whether this opcode is undefined/invalid */
  undefined?: boolean
}

/**
 * JumpTable indexed by opcode (0x00-0xFF)
 * Each entry contains the Operation for that opcode
 */
export type JumpTable = { [opcode: number]: Operation }

/**
 * Helper type for defining operations without all fields
 * Used when building instruction sets
 * Note: opcode, name, fullName, and constantGas are populated later by buildJumpTable
 */
export interface OperationInput {
  execute: ExecuteFunc
  dynamicGas?: DynamicGasFunc
  minStack?: number
  maxStack?: number
  isAsync?: boolean
}

/**
 * Creates a full Operation from partial input with defaults
 * Note: opcode, name, fullName, and constantGas are populated later by buildJumpTable
 */
export function makeOperation(input: OperationInput): Operation {
  return {
    opcode: 0, // Populated by buildJumpTable
    name: '', // Populated by buildJumpTable
    fullName: '', // Populated by buildJumpTable
    execute: input.execute,
    constantGas: 0n, // Populated by buildJumpTable from chain params
    dynamicGas: input.dynamicGas,
    minStack: input.minStack ?? 0,
    maxStack: input.maxStack ?? 1024,
    isAsync: input.isAsync ?? false,
    undefined: false,
  }
}

/**
 * Creates an undefined/invalid operation
 * Note: opcode is populated later by buildJumpTable
 */
export function makeUndefinedOperation(): Operation {
  return {
    opcode: 0, // Populated by buildJumpTable
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
}
