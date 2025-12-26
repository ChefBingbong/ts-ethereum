import type { Common } from '@ts-ethereum/chain-config'
import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import type { TypedTransaction } from '@ts-ethereum/tx'
import {
  bytesToHex,
  equalsBytes,
  EthereumJSErrorWithoutCode,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { sha256 } from 'ethereum-cryptography/sha256.js'
/* eslint-disable */
// This is to allow for a proper and linked collection of constructors for the class header.
// For tree shaking/code size this should be no problem since types go away on transpilation.
// TODO: See if there is an easier way to achieve the same result.
// See: https://github.com/microsoft/TypeScript/issues/47558
// (situation will eventually improve on Typescript and/or Eslint update)
import {
  BlockHeader,
  type createBlock,
  type createBlockFromBytesArray,
  type createBlockFromRLP,
  type createBlockFromRPC,
  genTransactionsTrieRoot,
} from '../index'
/* eslint-enable */
import type { BlockBytes, BlockOptions, JSONBlock } from '../types'

/**
 * Class representing a block in the Ethereum network. The {@link BlockHeader} has its own
 * class and can be used independently, for a block it is included in the form of the
 * {@link Block.header} property.
 *
 * A block object can be created with one of the following constructor methods
 * (separate from the Block class to allow for tree shaking):
 *
 * - {@link createBlock }
 * - {@link createBlockFromBytesArray }
 * - {@link createBlockFromRLP }
 * - {@link createBlockFromRPC }
 */
export class Block {
  public readonly header: BlockHeader
  public readonly transactions: TypedTransaction[] = []
  public readonly uncleHeaders: BlockHeader[] = []
  public readonly common: Common
  protected keccakFunction: (msg: Uint8Array) => Uint8Array
  protected sha256Function: (msg: Uint8Array) => Uint8Array

  protected cache: {
    txTrieRoot?: Uint8Array
  } = {}

  /**
   * This constructor takes the values, validates them, assigns them and freezes the object.
   *
   * @deprecated Use the static factory methods (see {@link Block} for an overview) to assist in creating
   * a Block object from varying data types and options.
   */
  constructor(
    header?: BlockHeader,
    transactions: TypedTransaction[] = [],
    uncleHeaders: BlockHeader[] = [],
    opts: BlockOptions = {},
  ) {
    this.header = header ?? new BlockHeader({}, opts)
    this.common = this.header.common
    this.keccakFunction = keccak256
    this.sha256Function = sha256

    this.transactions = transactions

    this.uncleHeaders = uncleHeaders
    if (uncleHeaders.length > 0) {
      this.validateUncles()
    }

    const freeze = opts?.freeze ?? true
    if (freeze) {
      Object.freeze(this)
    }
  }

  /**
   * Returns an array of the raw byte arrays for this block, in order.
   */
  raw(): BlockBytes {
    const bytesArray: BlockBytes = [
      this.header.raw(),
      // Frontier: all transactions are legacy
      this.transactions.map((tx) => tx.raw()),
      this.uncleHeaders.map((uh) => uh.raw()),
    ]

    return bytesArray
  }

  /**
   * Returns the hash of the block.
   */
  hash(): Uint8Array {
    return this.header.hash()
  }

  /**
   * Determines if this block is the genesis block.
   */
  isGenesis(): boolean {
    return this.header.isGenesis()
  }

  /**
   * Returns the rlp encoding of the block.
   */
  serialize(): Uint8Array {
    return RLP.encode(this.raw())
  }

  /**
   * Generates transaction trie for validation.
   */
  async genTxTrie(): Promise<Uint8Array> {
    return genTransactionsTrieRoot(
      this.transactions,
      new MerklePatriciaTrie({ common: this.common }),
    )
  }

  /**
   * Validates the transaction trie by generating a trie
   * and do a check on the root hash.
   * @returns True if the transaction trie is valid, false otherwise
   */
  async transactionsTrieIsValid(): Promise<boolean> {
    let result
    if (this.transactions.length === 0) {
      result = equalsBytes(this.header.transactionsTrie, KECCAK256_RLP)
      return result
    }

    if (this.cache.txTrieRoot === undefined) {
      this.cache.txTrieRoot = await this.genTxTrie()
    }
    result = equalsBytes(this.cache.txTrieRoot, this.header.transactionsTrie)
    return result
  }

  /**
   * Validates transaction signatures and minimum gas requirements.
   * @returns {string[]} an array of error strings
   */
  getTransactionsValidationErrors(): string[] {
    const errors: string[] = []

    // Simplified for Frontier - only legacy transactions
    for (const [i, tx] of this.transactions.entries()) {
      const errs = tx.getValidationErrors()
      if (errs.length > 0) {
        errors.push(`errors at tx ${i}: ${errs.join(', ')}`)
      }
    }

    return errors
  }

  /**
   * Validates transaction signatures and minimum gas requirements.
   * @returns True if all transactions are valid, false otherwise
   */
  transactionsAreValid(): boolean {
    const errors = this.getTransactionsValidationErrors()
    return errors.length === 0
  }

  /**
   * Validates the block data, throwing if invalid.
   * This can be checked on the Block itself without needing access to any parent block
   * It checks:
   * - All transactions are valid
   * - The tx trie is valid
   * - The uncle hash is valid
   * @param onlyHeader if only passed the header, skip validating txTrie and unclesHash (default: false)
   */
  async validateData(
    onlyHeader = false,
    skipTxValidation = false,
  ): Promise<void> {
    if (!skipTxValidation) {
      const txErrors = this.getTransactionsValidationErrors()
      if (txErrors.length > 0) {
        const msg = this._errorMsg(
          `invalid transactions: ${txErrors.join(' ')}`,
        )
        throw EthereumJSErrorWithoutCode(msg)
      }
    }

    if (onlyHeader) {
      return
    }

    if (!skipTxValidation) {
      for (const [index, tx] of this.transactions.entries()) {
        if (!tx.isSigned()) {
          const msg = this._errorMsg(
            `invalid transactions: transaction at index ${index} is unsigned`,
          )
          throw EthereumJSErrorWithoutCode(msg)
        }
      }
    }

    if (!(await this.transactionsTrieIsValid())) {
      const msg = this._errorMsg('invalid transaction trie')
      throw EthereumJSErrorWithoutCode(msg)
    }

    if (!this.uncleHashIsValid()) {
      const msg = this._errorMsg('invalid uncle hash')
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  /**
   * Validates the uncle's hash.
   * @returns true if the uncle's hash is valid, false otherwise.
   */
  uncleHashIsValid(): boolean {
    if (this.uncleHeaders.length === 0) {
      return equalsBytes(KECCAK256_RLP_ARRAY, this.header.uncleHash)
    }
    const uncles = this.uncleHeaders.map((uh) => uh.raw())
    const raw = RLP.encode(uncles)
    return equalsBytes(this.keccakFunction(raw), this.header.uncleHash)
  }

  /**
   * Consistency checks for uncles included in the block, if any.
   *
   * Throws if invalid.
   *
   * The rules for uncles checked are the following:
   * Header has at most 2 uncles.
   * Header does not count an uncle twice.
   */
  validateUncles() {
    if (this.isGenesis()) {
      return
    }

    // Header has at most 2 uncles
    if (this.uncleHeaders.length > 2) {
      const msg = this._errorMsg('too many uncle headers')
      throw EthereumJSErrorWithoutCode(msg)
    }

    // Header does not count an uncle twice.
    const uncleHashes = this.uncleHeaders.map((header) =>
      bytesToHex(header.hash()),
    )
    if (!(new Set(uncleHashes).size === uncleHashes.length)) {
      const msg = this._errorMsg('duplicate uncles')
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  /**
   * Validates if the block gasLimit remains in the boundaries set by the protocol.
   * Throws if invalid
   *
   * @param parentBlock - the parent of this `Block`
   */
  validateGasLimit(parentBlock: Block) {
    return this.header.validateGasLimit(parentBlock.header)
  }

  /**
   * Returns the block in JSON format.
   */
  toJSON(): JSONBlock {
    return {
      header: this.header.toJSON(),
      transactions: this.transactions.map((tx) => tx.toJSON()),
      uncleHeaders: this.uncleHeaders.map((uh) => uh.toJSON()),
    }
  }

  /**
   * Return a compact error string representation of the object
   */
  public errorStr() {
    let hash = ''
    try {
      hash = bytesToHex(this.hash())
    } catch {
      hash = 'error'
    }
    let hf = ''
    try {
      hf = this.common.hardfork()
    } catch {
      hf = 'error'
    }
    let errorStr = `block number=${this.header.number} hash=${hash} `
    errorStr += `hf=${hf} `
    errorStr += `txs=${this.transactions.length} uncles=${this.uncleHeaders.length}`
    return errorStr
  }

  /**
   * Internal helper function to create an annotated error message
   *
   * @param msg Base error message
   * @hidden
   */
  protected _errorMsg(msg: string) {
    return `${msg} (${this.errorStr()})`
  }
}
