import debugDefault from 'debug'
import { EventEmitter } from 'eventemitter3'
import { Hardfork } from '../chain-config'
import {
    Account,
    Address,
    BIGINT_0,
    BIGINT_1,
    EthereumJSErrorWithoutCode,
    KECCAK256_NULL,
    KECCAK256_RLP,
    MAX_INTEGER,
    bigIntToBytes,
    bytesToUnprefixedHex,
    createZeroAddress,
    equalsBytes,
    generateAddress,
    generateAddress2,
    short,
} from '../utils'

import { EVMError } from './errors.ts'
import { Interpreter } from './interpreter.ts'
import { Journal } from './journal.ts'
import { EVMPerformanceLogger } from './logger.ts'
import { Message } from './message.ts'
import { getOpcodesForHF } from './opcodes'
import { paramsEVM } from './params.ts'
import { getActivePrecompiles, getPrecompileName } from './precompiles'
import { TransientStorage } from './transientStorage.ts'
import {
    type Block,
    type CustomOpcode,
    type EVMBLSInterface,
    type EVMBN254Interface,
    type EVMEvent,
    type EVMInterface,
    type EVMMockBlockchainInterface,
    type EVMOpts,
    type EVMResult,
    type EVMRunCallOpts,
    type EVMRunCodeOpts,
    type ExecResult,
} from './types.ts'

import type { Common, StateManagerInterface } from '../chain-config'
import type { BinaryTreeAccessWitness } from './binaryTreeAccessWitness.ts'
import type { InterpreterOpts } from './interpreter.ts'
import type { Timer } from './logger.ts'
import type { MessageWithTo } from './message.ts'
import type { OpHandler, OpcodeList, OpcodeMap } from './opcodes'
import type { AsyncDynamicGasHandler, SyncDynamicGasHandler } from './opcodes/gas.ts'
import type { CustomPrecompile, PrecompileFunc } from './precompiles'

const debug = debugDefault('evm:evm')
const debugGas = debugDefault('evm:gas')
const debugPrecompiles = debugDefault('evm:precompiles')

/**
 * Creates a standardized ExecResult for out-of-gas errors.
 * @param gasLimit - Gas limit consumed by the failing frame
 * @returns Execution result describing the OOG failure
 */
export function OOGResult(gasLimit: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasLimit,
    exceptionError: new EVMError(EVMError.errorMessages.OUT_OF_GAS),
  }
}
/**
 * Creates an ExecResult for code-deposit out-of-gas errors (EIP-3541).
 * @param gasUsedCreateCode - Gas consumed while attempting to store code
 */
export function COOGResult(gasUsedCreateCode: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasUsedCreateCode,
    exceptionError: new EVMError(EVMError.errorMessages.CODESTORE_OUT_OF_GAS),
  }
}

/**
 * Returns an ExecResult signalling invalid bytecode input.
 * @param gasLimit - Gas consumed up to the point of failure
 */
export function INVALID_BYTECODE_RESULT(gasLimit: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasLimit,
    exceptionError: new EVMError(EVMError.errorMessages.INVALID_BYTECODE_RESULT),
  }
}

/**
 * Returns an ExecResult signalling invalid EOF formatting.
 * @param gasLimit - Gas consumed up to the point of failure
 */
export function INVALID_EOF_RESULT(gasLimit: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasLimit,
    exceptionError: new EVMError(EVMError.errorMessages.INVALID_EOF_FORMAT),
  }
}

/**
 * Returns an ExecResult for code size violations.
 * @param gasUsed - Gas consumed before the violation was detected
 */
export function CodesizeExceedsMaximumError(gasUsed: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasUsed,
    exceptionError: new EVMError(EVMError.errorMessages.CODESIZE_EXCEEDS_MAXIMUM),
  }
}

/**
 * Wraps an {@link EVMError} in an ExecResult.
 * @param error - Error encountered during execution
 * @param gasUsed - Gas consumed up to the error
 */
export function EVMErrorResult(error: EVMError, gasUsed: bigint): ExecResult {
  return {
    returnValue: new Uint8Array(0),
    executionGasUsed: gasUsed,
    exceptionError: error,
  }
}

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
 * The EVM (Ethereum Virtual Machine) is responsible for executing EVM bytecode, processing transactions, and managing state changes. It handles both contract calls and contract creation operations.
 *
 * An EVM instance can be created with the constructor method:
 *
 * - {@link createEVM}
 */
export class EVM implements EVMInterface {
  protected static supportedHardforks = [
    Hardfork.Chainstart,
  ]
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

  public readonly transientStorage: TransientStorage

  protected _opcodes!: OpcodeList

  public readonly allowUnlimitedContractSize: boolean
  public readonly allowUnlimitedInitCodeSize: boolean

  protected readonly _customOpcodes?: CustomOpcode[]
  protected readonly _customPrecompiles?: CustomPrecompile[]

  protected _handlers!: Map<number, OpHandler>

  protected _dynamicGasHandlers!: Map<number, AsyncDynamicGasHandler | SyncDynamicGasHandler>

  protected _opcodeMap!: OpcodeMap

  protected _precompiles!: Map<string, PrecompileFunc>

  protected readonly _optsCached: EVMOpts

  protected performanceLogger: EVMPerformanceLogger

  public get precompiles() {
    return this._precompiles
  }

  public get opcodes() {
    return this._opcodes
  }

  protected readonly _bls?: EVMBLSInterface

  /**
   * EVM is run in DEBUG mode (default: false)
   * Taken from DEBUG environment variable
   *
   * Safeguards on debug() calls are added for
   * performance reasons to avoid string literal evaluation
   * @hidden
   */
  readonly DEBUG: boolean = false

  protected readonly _emit: (topic: string, data: any) => Promise<void>

  private _bn254: EVMBN254Interface

  /**
   *
   * Creates new EVM object
   *
   * @deprecated The direct usage of this constructor is replaced since
   * non-finalized async initialization lead to side effects. Please
   * use the async {@link createEVM} constructor instead (same API).
   *
   * @param opts The EVM options
   * @param bn128 Initialized bn128 WASM object for precompile usage (internal)
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

    this.allowUnlimitedContractSize = opts.allowUnlimitedContractSize ?? false
    this.allowUnlimitedInitCodeSize = opts.allowUnlimitedInitCodeSize ?? false
    this._customOpcodes = opts.customOpcodes
    this._customPrecompiles = opts.customPrecompiles

    this.journal = new Journal(this.stateManager, this.common)
    this.transientStorage = new TransientStorage()

    this.common.events.on('hardforkChanged', () => {
      this.getActiveOpcodes()
      this._precompiles = getActivePrecompiles(this.common, this._customPrecompiles)
    })

    // Initialize the opcode data
    this.getActiveOpcodes()
    this._precompiles = getActivePrecompiles(this.common, this._customPrecompiles)

    // Precompile crypto libraries
    // (No additional crypto libraries needed for Frontier)

    this._bn254 = opts.bn254!

    this._emit = async (topic: string, data: any): Promise<void> => {
      const listeners = this.events.listeners(topic as keyof EVMEvent)
      for (const listener of listeners) {
        if (listener.length === 2) {
          await new Promise<void>((resolve) => {
            listener(data, resolve)
          })
        } else {
          listener(data)
        }
      }
    }

    this.performanceLogger = new EVMPerformanceLogger()

    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    // Additional window check is to prevent vite browser bundling (and potentially other) to break
    this.DEBUG =
      typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false
  }

  /**
   * Returns a list with the currently activated opcodes
   * available for EVM execution
   */
  getActiveOpcodes(): OpcodeList {
    const data = getOpcodesForHF(this.common, this._customOpcodes)
    this._opcodes = data.opcodes
    this._dynamicGasHandlers = data.dynamicGasHandlers
    this._handlers = data.handlers
    this._opcodeMap = data.opcodeMap
    return data.opcodes
  }

  protected async _executeCall(message: MessageWithTo): Promise<EVMResult> {
    const gasLimit = message.gasLimit
    const fromAddress = message.caller

    let account = await this.stateManager.getAccount(fromAddress)
    if (!account) {
      account = new Account()
    }
    let errorMessage
    // Reduce tx value from sender
    if (!message.delegatecall) {
      try {
        await this._reduceSenderBalance(account, message)
      } catch (e) {
        errorMessage = e
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
      } catch (e: any) {
        errorMessage = e
      }
    }

    // Load code
    await this._loadCode(message)
    let exit = false
    if (!message.code || (typeof message.code !== 'function' && message.code.length === 0)) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on no code (CALL)`)
      }
    }
    if (errorMessage !== undefined) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on value transfer overflowed (CALL)`)
      }
    }
    if (exit) {
      return {
        execResult: {
          gasRefund: message.gasRefund,
          executionGasUsed: message.gasLimit - gasLimit,
          exceptionError: errorMessage, // Only defined if addToBalance failed
          returnValue: new Uint8Array(0),
        },
      }
    }

    let result: ExecResult
    if (message.isCompiled) {
      let timer: Timer
      let callTimer: Timer | undefined
      let target: string
      if (this._optsCached.profiler?.enabled === true) {
        target = bytesToUnprefixedHex(message.codeAddress.bytes)
        // TODO: map target precompile not to address, but to a name
        target = getPrecompileName(target) ?? target.slice(20)
        if (this.performanceLogger.hasTimer()) {
          callTimer = this.performanceLogger.pauseTimer()
        }
        timer = this.performanceLogger.startTimer(target)
      }
      result = await this.runPrecompile(message.code as PrecompileFunc, message.data, gasLimit)

      if (this._optsCached.profiler?.enabled === true) {
        this.performanceLogger.stopTimer(timer!, Number(result.executionGasUsed), 'precompiles')
        if (callTimer !== undefined) {
          this.performanceLogger.unpauseTimer(callTimer)
        }
      }
      result.gasRefund = message.gasRefund
    } else {
      if (this.DEBUG) {
        debug(`Start bytecode processing...`)
      }
      result = await this.runInterpreter({
        ...{ codeAddress: message.codeAddress },
        ...message,
        gasLimit,
      } as Message)
    }

    if (message.depth === 0) {
      this.postMessageCleanup()
    }

    result.executionGasUsed += message.gasLimit - gasLimit

    return {
      execResult: result,
    }
  }

  protected async _executeCreate(message: Message): Promise<EVMResult> {
    const gasLimit = message.gasLimit

    let account = await this.stateManager.getAccount(message.caller)
    if (!account) {
      account = new Account()
    }
    // Reduce tx value from sender
    await this._reduceSenderBalance(account, message)

    // Frontier: no initcode size limit (EIP-3860 came in Shanghai)

    // TODO at some point, figure out why we swapped out data to code in the first place
    message.code = message.data
    message.data = message.eofCallData ?? new Uint8Array()
    message.to = await this._generateAddress(message)

    if (this.DEBUG) {
      debug(`Generated CREATE contract address ${message.to}`)
    }
    let toAccount = await this.stateManager.getAccount(message.to)
    if (!toAccount) {
      toAccount = new Account()
    }

    // Check for collision
    if (
      (toAccount.nonce && toAccount.nonce > BIGINT_0) ||
      !(equalsBytes(toAccount.codeHash, KECCAK256_NULL) === true) ||
      // See EIP 7610 and the discussion `https://ethereum-magicians.org/t/eip-7610-revert-creation-in-case-of-non-empty-storage`
      !(equalsBytes(toAccount.storageRoot, KECCAK256_RLP) === true)
    ) {
      if (this.DEBUG) {
        debug(`Returning on address collision`)
      }
      return {
        createdAddress: message.to,
        execResult: {
          returnValue: new Uint8Array(0),
          exceptionError: new EVMError(EVMError.errorMessages.CREATE_COLLISION),
          executionGasUsed: message.gasLimit,
        },
      }
    }

    await this.journal.putAccount(message.to, toAccount)
    await this.stateManager.clearStorage(message.to)

    const newContractEvent = {
      address: message.to,
      code: message.code,
    }

    await this._emit('newContract', newContractEvent)

    toAccount = await this.stateManager.getAccount(message.to)
    if (!toAccount) {
      toAccount = new Account()
    }
    // Frontier: no nonce increment on account creation (EIP-161 came later in SpuriousDragon)

    // Add tx value to the `to` account
    let errorMessage
    try {
      await this._addToBalance(toAccount, message as MessageWithTo)
    } catch (e: any) {
      errorMessage = e
    }

    let exit = false
    if (
      message.code === undefined ||
      (typeof message.code !== 'function' && message.code.length === 0)
    ) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on no code (CREATE)`)
      }
    }
    if (errorMessage !== undefined) {
      exit = true
      if (this.DEBUG) {
        debug(`Exit early on value transfer overflowed (CREATE)`)
      }
    }

    if (exit) {
      return {
        createdAddress: message.to,
        execResult: {
          executionGasUsed: BIGINT_0,
          gasRefund: message.gasRefund,
          exceptionError: errorMessage, // only defined if addToBalance failed
          returnValue: new Uint8Array(0),
        },
      }
    }

    if (this.DEBUG) {
      debug(`Start bytecode processing...`)
    }

    // run the message with the gas limit
    let result = await this.runInterpreter({ ...message, gasLimit, isCreate: true } as Message)

    // fee for size of the return value (Frontier behavior)
    let totalGas = result.executionGasUsed
    let returnFee = BIGINT_0
    if (!result.exceptionError) {
      returnFee = BigInt(result.returnValue.length) * BigInt(this.common.param('createDataGas'))
      totalGas = totalGas + returnFee
      if (this.DEBUG) {
        debugGas(`Add return value size fee (${returnFee} to gas used (-> ${totalGas}))`)
      }
    }

    // Frontier: no code size limit (EIP-170 came in SpuriousDragon)
    // Frontier: no EOF checks (EIP-3540/3541 came later)

    // If enough gas
    let CodestoreOOG = false
    if (totalGas <= message.gasLimit) {
      result.executionGasUsed = totalGas
    } else {
      // Frontier: out of gas or cannot pay the code deposit fee
      if (totalGas - returnFee <= message.gasLimit) {
        // we cannot pay the code deposit fee (but the deposit code actually did run)
        if (this.DEBUG) {
          debug(`Not enough gas to pay the code deposit fee (Frontier)`)
        }
        result = { ...result, ...COOGResult(totalGas - returnFee) }
        CodestoreOOG = true
      } else {
        if (this.DEBUG) {
          debug(`Contract creation: out of gas`)
        }
        result = { ...result, ...OOGResult(message.gasLimit) }
      }
    }

    // Save code if a new contract was created
    if (
      !result.exceptionError &&
      result.returnValue !== undefined &&
      result.returnValue.length !== 0
    ) {
      await this.stateManager.putCode(message.to, result.returnValue)
      if (this.DEBUG) {
        debug(`Code saved on new contract creation`)
      }
    } else if (CodestoreOOG) {
      // Frontier: put an empty contract when code deposit fee cannot be paid.
      // This contract would be considered "DEAD" in later hard forks.
      // It is thus an unnecessary default item, which we have to save to disk
      // It does change the state root, but it only wastes storage.
      const account = await this.stateManager.getAccount(message.to)
      await this.journal.putAccount(message.to, account ?? new Account())
    }

    if (message.depth === 0) {
      this.postMessageCleanup()
    }

    return {
      createdAddress: message.to,
      execResult: result,
    }
  }

  /**
   * Starts the actual bytecode processing for a CALL or CREATE
   */
  protected async runInterpreter(
    message: Message,
    opts: InterpreterOpts = {},
  ): Promise<ExecResult> {
    let contract = await this.stateManager.getAccount(message.to ?? createZeroAddress())
    if (!contract) {
      contract = new Account()
    }

    const env = {
      address: message.to ?? createZeroAddress(),
      caller: message.caller ?? createZeroAddress(),
      callData: message.data ?? Uint8Array.from([0]),
      callValue: message.value ?? BIGINT_0,
      code: message.code as Uint8Array,
      isStatic: message.isStatic ?? false,
      isCreate: message.isCreate ?? false,
      depth: message.depth ?? 0,
      gasPrice: this._tx!.gasPrice,
      origin: this._tx!.origin ?? message.caller ?? createZeroAddress(),
      block: this._block ?? defaultBlock(),
      contract,
      codeAddress: message.codeAddress,
      gasRefund: message.gasRefund,
      chargeCodeAccesses: message.chargeCodeAccesses,
      accessWitness: message.accessWitness,
      createdAddresses: message.createdAddresses,
    }

    const interpreter = new Interpreter(
      this,
      this.stateManager,
      this.blockchain,
      env,
      message.gasLimit,
      this.journal,
      this.performanceLogger,
      this._optsCached.profiler,
    )
    if (message.selfdestruct) {
      interpreter._result.selfdestruct = message.selfdestruct
    }
    if (message.createdAddresses) {
      interpreter._result.createdAddresses = message.createdAddresses
    }

    const interpreterRes = await interpreter.run(message.code as Uint8Array, opts)

    let result = interpreter._result
    let gasUsed = message.gasLimit - interpreterRes.runState!.gasLeft
    if (interpreterRes.exceptionError) {
      if (
        interpreterRes.exceptionError.error !== EVMError.errorMessages.REVERT &&
        interpreterRes.exceptionError.error !== EVMError.errorMessages.INVALID_EOF_FORMAT
      ) {
        gasUsed = message.gasLimit
      }

      // Clear the result on error
      result = {
        ...result,
        logs: [],
        selfdestruct: new Set(),
        createdAddresses: new Set(),
      }
    }

    message.accessWitness?.commit()
    return {
      ...result,
      runState: {
        ...interpreterRes.runState!,
        ...result,
        ...interpreter._env,
      },
      exceptionError: interpreterRes.exceptionError,
      gas: interpreterRes.runState?.gasLeft,
      executionGasUsed: gasUsed,
      gasRefund: interpreterRes.runState!.gasRefund,
      returnValue: result.returnValue ?? new Uint8Array(0),
    }
  }

  /**
   * Executes an EVM message, determining whether it's a call or create
   * based on the `to` address. It checkpoints the state and reverts changes
   * if an exception happens during the message execution.
   */
  async runCall(opts: EVMRunCallOpts): Promise<EVMResult> {
    let timer: Timer | undefined
    if (
      (opts.depth === 0 || opts.message === undefined) &&
      this._optsCached.profiler?.enabled === true
    ) {
      timer = this.performanceLogger.startTimer('Initialization')
    }
    let message = opts.message
    let callerAccount
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
        code: opts.code,
        depth: opts.depth,
        isCompiled: opts.isCompiled,
        isStatic: opts.isStatic,
        salt: opts.salt,
        selfdestruct: opts.selfdestruct ?? new Set(),
        createdAddresses: opts.createdAddresses ?? new Set(),
        delegatecall: opts.delegatecall,
      })
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

    // Frontier: no warm address preloading (EIP-2929 came in Berlin)

    await this.journal.checkpoint()
    if (this.DEBUG) {
      debug('-'.repeat(100))
      debug(`message checkpoint`)
    }

    let result
    if (this.DEBUG) {
      const { caller, gasLimit, to, value, delegatecall } = message
      debug(
        `New message caller=${caller} gasLimit=${gasLimit} to=${
          to?.toString() ?? 'none'
        } value=${value} delegatecall=${delegatecall ? 'yes' : 'no'}`,
      )
    }
    if (message.to) {
      if (this.DEBUG) {
        debug(`Message CALL execution (to: ${message.to})`)
      }
      result = await this._executeCall(message as MessageWithTo)
    } else {
      if (this.DEBUG) {
        debug(`Message CREATE execution (to: undefined)`)
      }
      result = await this._executeCreate(message)
    }
    if (this.DEBUG) {
      const { executionGasUsed, exceptionError, returnValue } = result.execResult
      debug(
        `Received message execResult: [ gasUsed=${executionGasUsed} exceptionError=${
          exceptionError ? `'${exceptionError.error}'` : 'none'
        } returnValue=${short(returnValue)} gasRefund=${result.execResult.gasRefund ?? 0} ]`,
      )
    }
    const err = result.execResult.exceptionError
    // This clause captures any error which happened during execution
    // If that is the case, then all refunds are forfeited
    // There is one exception: if the CODESTORE_OUT_OF_GAS error is thrown
    // (this only happens the Frontier/Chainstart fork)
    // then the error is dismissed
    if (err && err.error !== EVMError.errorMessages.CODESTORE_OUT_OF_GAS) {
      result.execResult.selfdestruct = new Set()
      result.execResult.createdAddresses = new Set()
      result.execResult.gasRefund = BIGINT_0
    }
    if (
      err &&
      !(
        this.common.hardfork() === Hardfork.Chainstart &&
        err.error === EVMError.errorMessages.CODESTORE_OUT_OF_GAS
      )
    ) {
      result.execResult.logs = []
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

    if (message.depth === 0 && this._optsCached.profiler?.enabled === true) {
      this.performanceLogger.stopTimer(timer!, 0)
    }

    message.accessWitness?.commit()
    return result
  }

  /**
   * Bound to the global VM and therefore
   * shouldn't be used directly from the evm class
   */
  async runCode(opts: EVMRunCodeOpts): Promise<ExecResult> {
    this._block = opts.block ?? defaultBlock()

    this._tx = {
      gasPrice: opts.gasPrice ?? BIGINT_0,
      origin: opts.origin ?? opts.caller ?? createZeroAddress(),
    }

    const message = new Message({
      code: opts.code,
      data: opts.data,
      gasLimit: opts.gasLimit ?? BigInt(0xffffff),
      to: opts.to ?? createZeroAddress(),
      caller: opts.caller,
      value: opts.value,
      depth: opts.depth,
      selfdestruct: opts.selfdestruct ?? new Set(),
      isStatic: opts.isStatic,
    })

    return this.runInterpreter(message, { pc: opts.pc })
  }

  /**
   * Returns code for precompile at the given address, or undefined
   * if no such precompile exists.
   */
  getPrecompile(address: Address): PrecompileFunc | undefined {
    return this.precompiles.get(bytesToUnprefixedHex(address.bytes))
  }

  /**
   * Executes a precompiled contract with given data and gas limit.
   */
  protected runPrecompile(
    code: PrecompileFunc,
    data: Uint8Array,
    gasLimit: bigint,
  ): Promise<ExecResult> | ExecResult {
    if (typeof code !== 'function') {
      throw EthereumJSErrorWithoutCode('Invalid precompile')
    }

    const opts = {
      data,
      gasLimit,
      common: this.common,
      _EVM: this,
      _debug: this.DEBUG ? debugPrecompiles : undefined,
      stateManager: this.stateManager,
    }

    return code(opts)
  }

  protected async _loadCode(message: Message): Promise<void> {
    if (!message.code) {
      const precompile = this.getPrecompile(message.codeAddress)
      if (precompile) {
        message.code = precompile
        message.isCompiled = true
      } else {
        message.code = await this.stateManager.getCode(message.codeAddress)

        // Frontier: no EIP-7702 delegation

        message.isCompiled = false
        message.chargeCodeAccesses = true
      }
    }
  }

  protected async _generateAddress(message: Message): Promise<Address> {
    let addr
    if (message.salt) {
      addr = generateAddress2(message.caller.bytes, message.salt, message.code as Uint8Array)
    } else {
      let acc = await this.stateManager.getAccount(message.caller)
      if (!acc) {
        acc = new Account()
      }
      const newNonce = acc.nonce - BIGINT_1
      addr = generateAddress(message.caller.bytes, bigIntToBytes(newNonce))
    }
    return new Address(addr)
  }

  protected async _reduceSenderBalance(account: Account, message: Message): Promise<void> {
    account.balance -= message.value
    if (account.balance < BIGINT_0) {
      throw new EVMError(EVMError.errorMessages.INSUFFICIENT_BALANCE)
    }
    const result = this.journal.putAccount(message.caller, account)
    if (this.DEBUG) {
      debug(`Reduced sender (${message.caller}) balance (-> ${account.balance})`)
    }
    return result
  }

  protected async _addToBalance(toAccount: Account, message: MessageWithTo): Promise<void> {
    const newBalance = toAccount.balance + message.value
    if (newBalance > MAX_INTEGER) {
      throw new EVMError(EVMError.errorMessages.VALUE_OVERFLOW)
    }
    toAccount.balance = newBalance
    // putAccount as the nonce may have changed for contract creation
    await this.journal.putAccount(message.to, toAccount)
    if (this.DEBUG) {
      debug(`Added toAccount (${message.to}) balance (-> ${toAccount.balance})`)
    }
  }

  /**
   * Once the interpreter has finished depth 0, a post-message cleanup should be done
   */
  private postMessageCleanup() {
    // Frontier: no transient storage (EIP-1153 came in Cancun)
  }

  /**
   * This method copies the EVM, current HF and EIP settings
   * and returns a new EVM instance.
   *
   * Note: this is only a shallow copy and both EVM instances
   * will point to the same underlying state DB.
   *
   * @returns EVM
   */
  public shallowCopy(): EVM {
    const common = this.common.copy()
    common.setHardfork(this.common.hardfork())

    const opts = {
      ...this._optsCached,
      common,
      stateManager: this.stateManager.shallowCopy(),
    }
    opts.stateManager['common'] = common
    return new EVM(opts)
  }

  public getPerformanceLogs() {
    return this.performanceLogger.getLogs()
  }

  public clearPerformanceLogs() {
    this.performanceLogger.clear()
  }
}
