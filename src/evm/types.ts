import type { EventEmitter } from 'eventemitter3'
import type {
    BinaryTreeAccessWitnessInterface,
    Common,
    ParamsDict,
    StateManagerInterface,
} from '../chain-config'
import type { Account, Address, PrefixedHexString } from '../utils'
import type { BinaryTreeAccessWitness } from './binaryTreeAccessWitness.ts'
import type { EVMError } from './errors.ts'
import type { Message } from './message.ts'

/**
 * Base options for the `EVM.runCall()` method.
 */
interface EVMRunOpts {
  /**
   * The `block` the `tx` belongs to. If omitted a default blank block will be used.
   */
  block?: Block
  /**
   * The gas price for the call. Defaults to `0`
   */
  gasPrice?: bigint
  /**
   * The address where the call originated from. Defaults to the zero address.
   */
  origin?: Address
  /**
   * The address that ran this code (`msg.sender`). Defaults to the zero address.
   */
  caller?: Address
  /**
   * The input data.
   */
  data?: Uint8Array
  /**
   * The gas limit for the call. Defaults to `16777215` (`0xffffff`)
   */
  gasLimit?: bigint
  /**
   * The value in ether that is being sent to `opts.address`. Defaults to `0`
   */
  value?: bigint
  /**
   * The call depth. Defaults to `0`
   */
  depth?: number
  /**
   * The address of the account that is executing this code (`address(this)`). Defaults to the zero address.
   */
  to?: Address
}

/**
 * Options for running a call operation with `EVM.runCall()`
 */
export interface EVMRunCallOpts extends EVMRunOpts {
  /**
   * Skip balance checks if true. If caller balance is less than message value,
   * sets balance to message value to ensure execution doesn't fail.
   */
  skipBalance?: boolean
  /**
   * If the call is a DELEGATECALL. Defaults to false.
   */
  delegatecall?: boolean
  /**
   * Refund counter. Defaults to `0`
   */
  gasRefund?: bigint
  /**
   * Optionally pass in an already-built message.
   */
  message?: Message

  accessWitness?: BinaryTreeAccessWitnessInterface
}

export type EVMEvent = {
  beforeMessage: (data: Message, resolve?: (result?: any) => void) => void
  afterMessage: (data: EVMResult, resolve?: (result?: any) => void) => void
}

export interface EVMInterface {
  common: Common
  journal: {
    commit(): Promise<void>
    revert(): Promise<void>
    checkpoint(): Promise<void>
    cleanJournal(): void
    cleanup(): Promise<void>
    putAccount(address: Address, account: Account): Promise<void>
    deleteAccount(address: Address): Promise<void>
    accessList?: Map<string, Set<string>>
    preimages?: Map<PrefixedHexString, Uint8Array>
    addAlwaysWarmAddress(address: string, addToAccessList?: boolean): void
    addAlwaysWarmSlot(address: string, slot: string, addToAccessList?: boolean): void
    startReportingAccessList(): void
    startReportingPreimages?(): void
  }
  stateManager: StateManagerInterface
  precompiles: Map<string, never>
  runCall(opts: EVMRunCallOpts): Promise<EVMResult>
  events?: EventEmitter<EVMEvent>
  binaryTreeAccessWitness?: BinaryTreeAccessWitness
  systemBinaryAccessWitness?: BinaryTreeAccessWitness
}

/**
 * Options for instantiating a {@link EVM}.
 */
export interface EVMOpts {
  /**
   * Use a {@link Common} instance for EVM instantiation.
   */
  common?: Common

  /**
   * EVM parameters sorted by EIP can be found in the exported `paramsEVM` dictionary,
   * which is internally passed to the associated `@ethereumjs/common` instance which
   * manages parameter selection based on the hardfork and EIP settings.
   *
   * This option allows providing a custom set of parameters. Note that parameters
   * get fully overwritten, so you need to extend the default parameter dict
   * to provide the full parameter set.
   */
  params?: ParamsDict

  /*
   * The EVM comes with a basic dependency-minimized `SimpleStateManager` implementation
   * which serves most code execution use cases and which is included in the
   * `@ethereumjs/statemanager` package.
   *
   * The `@ethereumjs/statemanager` package also provides a variety of state manager
   * implementations for different needs (MPT-tree backed, RPC, experimental binary tree)
   * which can be used by this option as a replacement.
   */
  stateManager?: StateManagerInterface

  /**
   * The EVM comes with a basic mock blockchain interface and implementation for
   * non-block containing use cases.
   *
   * For block-containing setups use the full blockchain implementation from the
   * `@ethereumjs/blockchain package.
   */
  blockchain?: EVMMockBlockchainInterface
}

/**
 * Result of executing a message via the {@link EVM}.
 */
export interface EVMResult {
  /**
   * Contains the results from running the code, if any, as described in {@link runCall}
   */
  execResult: ExecResult
}

/**
 * Result of executing a call via the {@link EVM}.
 */
export interface ExecResult {
  /**
   * Description of the exception, if any occurred
   */
  exceptionError?: EVMError
  /**
   * Amount of gas left
   */
  gas?: bigint
  /**
   * Amount of gas the code used to run
   */
  executionGasUsed: bigint
  /**
   * Return value from the contract
   */
  returnValue: Uint8Array
  /**
   * The gas refund counter
   */
  gasRefund?: bigint
}

export type Block = {
  header: {
    number: bigint
    coinbase: Address
    timestamp: bigint
    difficulty: bigint
    gasLimit: bigint
  }
}

export type EVMMockBlock = {
  hash(): Uint8Array
}

export interface EVMMockBlockchainInterface {
  getBlock(blockId: number): Promise<EVMMockBlock>
  putBlock(block: EVMMockBlock): Promise<void>
  shallowCopy(): EVMMockBlockchainInterface
}

export class EVMMockBlockchain implements EVMMockBlockchainInterface {
  async getBlock() {
    return {
      hash() {
        return new Uint8Array(32)
      },
    }
  }
  async putBlock() {}
  shallowCopy() {
    return this
  }
}
