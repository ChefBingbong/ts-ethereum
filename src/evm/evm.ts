import debugDefault from 'debug'
import { EventEmitter } from 'eventemitter3'
import type { Common, StateManagerInterface } from '../chain-config'
import { Hardfork } from '../chain-config'
import {
  Account,
  type Address,
  BIGINT_0,
  createZeroAddress,
  EthereumJSErrorWithoutCode,
  MAX_INTEGER,
} from '../utils'
import type { BinaryTreeAccessWitness } from './binaryTreeAccessWitness.ts'
import { EVMError } from './errors.ts'
import { Journal } from './journal.ts'
import type { MessageWithTo } from './message.ts'
import { Message } from './message.ts'
import { paramsEVM } from './params.ts'
import type {
  Block,
  EVMEvent,
  EVMInterface,
  EVMMockBlockchainInterface,
  EVMOpts,
  EVMResult,
  EVMRunCallOpts,
  ExecResult,
} from './types.ts'

const debug = debugDefault('evm:evm')

/**
 * Creates a default block header used by stand-alone executions.
 * @returns Block-like object with zeroed header fields
 */
export function defaultBlock(): Block {
  return {
    header: {
      number: BIGINT_0,
      coinbase: createZeroAddress(),
      timestamp: BIGINT_0,
      difficulty: BIGINT_0,
      gasLimit: BIGINT_0,
    },
  }
}

/**
 * The EVM (Ethereum Virtual Machine) - Simplified for value transfers only.
 * This version does NOT support smart contract execution, only native currency transfers.
 *
 * An EVM instance can be created with the constructor method:
 *
 * - {@link createEVM}
 */
export class EVM implements EVMInterface {
  protected static supportedHardforks = [Hardfork.Chainstart]
  protected _tx?: {
    gasPrice: bigint
    origin: Address
  }
  protected _block?: Block

  public readonly common: Common
  public readonly events: EventEmitter<EVMEvent>

  public stateManager: StateManagerInterface
  public blockchain: EVMMockBlockchainInterface
  public journal: Journal
  public binaryAccessWitness?: BinaryTreeAccessWitness
  public systemBinaryAccessWitness?: BinaryTreeAccessWitness

  // Empty precompiles map - no precompiles in value-transfer-only mode
  public readonly precompiles: Map<string, never> = new Map<string, never>()

  protected readonly _optsCached: EVMOpts

  /**
   * EVM is run in DEBUG mode (default: false)
   * Taken from DEBUG environment variable
   *
   * Safeguards on debug() calls are added for
   * performance reasons to avoid string literal evaluation
   * @hidden
   */
  readonly DEBUG: boolean = false

  protected readonly _emit: (
    topic: string,
    data: Message | EVMResult,
  ) => Promise<void>

  /**
   *
   * Creates new EVM object
   *
   * @deprecated The direct usage of this constructor is replaced since
   * non-finalized async initialization lead to side effects. Please
   * use the async {@link createEVM} constructor instead (same API).
   *
   * @param opts The EVM options
   */
  constructor(opts: EVMOpts) {
    this.common = opts.common!
    this.blockchain = opts.blockchain!
    this.stateManager = opts.stateManager!

    this.events = new EventEmitter<EVMEvent>()
    this._optsCached = opts

    // Only Chainstart/Frontier hardfork is supported
    if (!EVM.supportedHardforks.includes(this.common.hardfork() as Hardfork)) {
      throw EthereumJSErrorWithoutCode(
        `Hardfork ${this.common.hardfork()} not set as supported in supportedHardforks`,
      )
    }

    this.common.updateParams(opts.params ?? paramsEVM)

    this.journal = new Journal(this.stateManager)

    this._emit = async (
      topic: string,
      data: Message | EVMResult,
    ): Promise<void> => {
      const listeners = this.events.listeners(topic as keyof EVMEvent)
      for (const listener of listeners) {
        if (listener.length === 2) {
          await new Promise<void>((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(listener as (data: any, resolve: () => void) => void)(
              data,
              resolve,
            )
          })
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(listener as (data: any) => void)(data)
        }
      }
    }

    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    // Additional window check is to prevent vite browser bundling (and potentially other) to break
    this.DEBUG =true
  }

  /**
   * Executes a simple value transfer between accounts.
   * This simplified version does NOT execute contract code.
   */
  protected async _executeCall(message: MessageWithTo): Promise<EVMResult> {
    const fromAddress = message.caller

    let account = await this.stateManager.getAccount(fromAddress)
    if (!account) {
      account = new Account()
    }
    let errorMessage: EVMError | undefined

    // Reduce tx value from sender
    if (!message.delegatecall) {
      try {
        await this._reduceSenderBalance(account, message)
      } catch (e) {
        errorMessage = e as EVMError
      }
    }

    // Load `to` account
    let toAccount = await this.stateManager.getAccount(message.to)
    if (!toAccount) {
      toAccount = new Account()
    }

    // Add tx value to the `to` account
    if (!message.delegatecall) {
      try {
        await this._addToBalance(toAccount, message)
      } catch (e) {
        errorMessage = e as EVMError
      }
    }

    // Value transfer only - no code execution
    if (this.DEBUG) {
      debug(`Value transfer completed from ${fromAddress} to ${message.to}`)
    }

    return {
      execResult: {
        gasRefund: message.gasRefund,
        executionGasUsed: BIGINT_0,
        exceptionError: errorMessage,
        returnValue: new Uint8Array(0),
      },
    }
  }

  /**
   * Executes an EVM message for value transfer only.
   * Contract creation (to === undefined) is NOT supported and will throw.
   */
  async runCall(opts: EVMRunCallOpts): Promise<EVMResult> {
    let message = opts.message
    let callerAccount: Account | undefined

    if (!message) {
      this._block = opts.block ?? defaultBlock()
      const caller = opts.caller ?? createZeroAddress()
      this._tx = {
        gasPrice: opts.gasPrice ?? BIGINT_0,
        origin: opts.origin ?? caller,
      }

      const value = opts.value ?? BIGINT_0
      if (opts.skipBalance === true) {
        callerAccount = await this.stateManager.getAccount(caller)
        if (!callerAccount) {
          callerAccount = new Account()
        }
        if (callerAccount.balance < value) {
          // if skipBalance and balance less than value, set caller balance to `value` to ensure sufficient funds
          callerAccount.balance = value
          await this.journal.putAccount(caller, callerAccount)
        }
      }

      message = new Message({
        caller,
        gasLimit: opts.gasLimit ?? BigInt(0xffffff),
        to: opts.to,
        value,
        data: opts.data,
        depth: opts.depth,
        delegatecall: opts.delegatecall,
      })
    }

    // Contract creation is not supported
    if (!message.to) {
      throw EthereumJSErrorWithoutCode(
        'Contract creation is not supported. This blockchain only supports value transfers.',
      )
    }

    if (message.depth === 0) {
      if (!callerAccount) {
        callerAccount = await this.stateManager.getAccount(message.caller)
      }
      if (!callerAccount) {
        callerAccount = new Account()
      }
      callerAccount.nonce++
      await this.journal.putAccount(message.caller, callerAccount)
      if (this.DEBUG) {
        debug(`Update fromAccount (caller) nonce (-> ${callerAccount.nonce}))`)
      }
    }

    await this._emit('beforeMessage', message)

    await this.journal.checkpoint()
    if (this.DEBUG) {
      debug('-'.repeat(100))
      debug(`message checkpoint`)
    }

    let result: EVMResult
    if (this.DEBUG) {
      const { caller, gasLimit, to, value, delegatecall } = message
      debug(
        `New message caller=${caller} gasLimit=${gasLimit} to=${
          to?.toString() ?? 'none'
        } value=${value} delegatecall=${delegatecall ? 'yes' : 'no'}`,
      )
    }

    if (this.DEBUG) {
      debug(`Message CALL execution (to: ${message.to})`)
    }
    result = await this._executeCall(message as MessageWithTo)

    if (this.DEBUG) {
      const { executionGasUsed, exceptionError } = result.execResult
      debug(
        `Received message execResult: [ gasUsed=${executionGasUsed} exceptionError=${
          exceptionError ? `'${exceptionError.error}'` : 'none'
        } gasRefund=${result.execResult.gasRefund ?? 0} ]`,
      )
    }

    const err = result.execResult.exceptionError
    if (err) {
      result.execResult.gasRefund = BIGINT_0
      await this.journal.revert()
      if (this.DEBUG) {
        debug(`message checkpoint reverted`)
      }
    } else {
      await this.journal.commit()
      if (this.DEBUG) {
        debug(`message checkpoint committed`)
      }
    }

    await this._emit('afterMessage', result)

    return result
  }

  /**
   * runCode is not supported in value-transfer-only mode.
   * @throws Always throws an error
   */
  async runCode(): Promise<ExecResult> {
    throw EthereumJSErrorWithoutCode(
      'runCode is not supported. This blockchain only supports value transfers, not smart contract execution.',
    )
  }

  protected async _reduceSenderBalance(
    account: Account,
    message: Message,
  ): Promise<void> {
    account.balance -= message.value
    if (account.balance < BIGINT_0) {
      throw new EVMError(EVMError.errorMessages.INSUFFICIENT_BALANCE)
    }
    const result = this.journal.putAccount(message.caller, account)
    if (this.DEBUG) {
      debug(
        `Reduced sender (${message.caller}) balance (-> ${account.balance})`,
      )
    }
    return result
  }

  protected async _addToBalance(
    toAccount: Account,
    message: MessageWithTo,
  ): Promise<void> {
    const newBalance = toAccount.balance + message.value
    if (newBalance > MAX_INTEGER) {
      throw new EVMError(EVMError.errorMessages.VALUE_OVERFLOW)
    }
    toAccount.balance = newBalance
    await this.journal.putAccount(message.to, toAccount)
    if (this.DEBUG) {
      debug(`Added toAccount (${message.to}) balance (-> ${toAccount.balance})`)
    }
  }

  /**
   * This method copies the EVM, current HF settings
   * and returns a new EVM instance.
   *
   * Note: this is only a shallow copy and both EVM instances
   * will point to the same underlying state DB.
   *
   * @returns EVM
   */
  public shallowCopy(): EVM {
    const common = this.common.copy()

    const opts = {
      ...this._optsCached,
      common,
      stateManager: this.stateManager.shallowCopy(),
    } as any
    opts.stateManager['common'] = common
    return new EVM(opts)
  }
}
