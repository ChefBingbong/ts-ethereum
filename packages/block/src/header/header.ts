import {
  Common,
  ConsensusAlgorithm,
  ConsensusType,
} from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  Address,
  BIGINT_0,
  BIGINT_2,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToHex,
  createZeroAddress,
  EthereumJSErrorWithoutCode,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  toType,
  TypeOutput,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'

import type {
  BlockHeaderBytes,
  BlockOptions,
  HeaderData,
  JSONHeader,
} from '../types'

interface HeaderCache {
  hash: Uint8Array | undefined
}

const DEFAULT_GAS_LIMIT = BigInt('0xffffffffffffff')

/**
 * An object that represents the block header (Frontier format).
 */
export class BlockHeader {
  public readonly parentHash: Uint8Array
  public readonly uncleHash: Uint8Array
  public readonly coinbase: Address
  public readonly stateRoot: Uint8Array
  public readonly transactionsTrie: Uint8Array
  public readonly receiptTrie: Uint8Array
  public readonly logsBloom: Uint8Array
  public readonly difficulty: bigint
  public readonly number: bigint
  public readonly gasLimit: bigint
  public readonly gasUsed: bigint
  public readonly timestamp: bigint
  public readonly extraData: Uint8Array
  public readonly mixHash: Uint8Array
  public readonly nonce: Uint8Array

  public readonly common: Common

  protected keccakFunction: (msg: Uint8Array) => Uint8Array

  protected cache: HeaderCache = {
    hash: undefined,
  }

  /**
   * This constructor takes the values, validates them, assigns them and freezes the object.
   *
   * @deprecated Use the public static factory methods to assist in creating a Header object from
   * varying data types. For a default empty header, use {@link createBlockHeader}.
   *
   */ 
  constructor(headerData: HeaderData, opts: BlockOptions = {}) {
    this.common = opts.common?.copy() ?? new Common({} as any)

    this.keccakFunction = keccak256
    const skipValidateConsensusFormat =
      opts.skipConsensusFormatValidation ?? false

    const defaults = {
      parentHash: new Uint8Array(32),
      uncleHash: KECCAK256_RLP_ARRAY,
      coinbase: createZeroAddress(),
      stateRoot: new Uint8Array(32),
      transactionsTrie: KECCAK256_RLP,
      receiptTrie: KECCAK256_RLP,
      logsBloom: new Uint8Array(256),
      difficulty: BIGINT_0,
      number: BIGINT_0,
      gasLimit: DEFAULT_GAS_LIMIT,
      gasUsed: BIGINT_0,
      timestamp: BIGINT_0,
      extraData: new Uint8Array(0),
      mixHash: new Uint8Array(32),
      nonce: new Uint8Array(8),
    }

    const parentHash =
      toType(headerData.parentHash, TypeOutput.Uint8Array) ??
      defaults.parentHash
    const uncleHash =
      toType(headerData.uncleHash, TypeOutput.Uint8Array) ?? defaults.uncleHash
    const coinbase = new Address(
      toType(headerData.coinbase ?? defaults.coinbase, TypeOutput.Uint8Array),
    )
    const stateRoot =
      toType(headerData.stateRoot, TypeOutput.Uint8Array) ?? defaults.stateRoot
    const transactionsTrie =
      toType(headerData.transactionsTrie, TypeOutput.Uint8Array) ??
      defaults.transactionsTrie
    const receiptTrie =
      toType(headerData.receiptTrie, TypeOutput.Uint8Array) ??
      defaults.receiptTrie
    const logsBloom =
      toType(headerData.logsBloom, TypeOutput.Uint8Array) ?? defaults.logsBloom
    const difficulty =
      toType(headerData.difficulty, TypeOutput.BigInt) ?? defaults.difficulty
    const number =
      toType(headerData.number, TypeOutput.BigInt) ?? defaults.number
    const gasLimit =
      toType(headerData.gasLimit, TypeOutput.BigInt) ?? defaults.gasLimit
    const gasUsed =
      toType(headerData.gasUsed, TypeOutput.BigInt) ?? defaults.gasUsed
    const timestamp =
      toType(headerData.timestamp, TypeOutput.BigInt) ?? defaults.timestamp
    const extraData =
      toType(headerData.extraData, TypeOutput.Uint8Array) ?? defaults.extraData
    const mixHash =
      toType(headerData.mixHash, TypeOutput.Uint8Array) ?? defaults.mixHash
    const nonce =
      toType(headerData.nonce, TypeOutput.Uint8Array) ?? defaults.nonce

    this.parentHash = parentHash
    this.uncleHash = uncleHash
    this.coinbase = coinbase
    this.stateRoot = stateRoot
    this.transactionsTrie = transactionsTrie
    this.receiptTrie = receiptTrie
    this.logsBloom = logsBloom
    this.difficulty = difficulty
    this.number = number
    this.gasLimit = gasLimit
    this.gasUsed = gasUsed
    this.timestamp = timestamp
    this.extraData = extraData
    this.mixHash = mixHash
    this.nonce = nonce

    this._genericFormatValidation()

    // Now we have set all the values of this Header, we possibly have set a dummy
    // `difficulty` value (defaults to 0). If we have a `calcDifficultyFromHeader`
    // block option parameter, we instead set difficulty to this value.
    if (
      opts.calcDifficultyFromHeader &&
      this.common.consensusAlgorithm() === ConsensusAlgorithm.Ethash
    ) {
      this.difficulty = this.ethashCanonicalDifficulty(
        opts.calcDifficultyFromHeader,
      )
    }

    // Validate consensus format after block is sealed (if applicable) so extraData checks will pass
    if (skipValidateConsensusFormat === false) this._consensusFormatValidation()

    const freeze = opts?.freeze ?? true
    if (freeze) {
      Object.freeze(this)
    }
  }

  /**
   * Validates correct buffer lengths, throws if invalid.
   */
  protected _genericFormatValidation() {
    const {
      parentHash,
      stateRoot,
      transactionsTrie,
      receiptTrie,
      mixHash,
      nonce,
    } = this

    if (parentHash.length !== 32) {
      const msg = this._errorMsg(
        `parentHash must be 32 bytes, received ${parentHash.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (stateRoot.length !== 32) {
      const msg = this._errorMsg(
        `stateRoot must be 32 bytes, received ${stateRoot.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (transactionsTrie.length !== 32) {
      const msg = this._errorMsg(
        `transactionsTrie must be 32 bytes, received ${transactionsTrie.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (receiptTrie.length !== 32) {
      const msg = this._errorMsg(
        `receiptTrie must be 32 bytes, received ${receiptTrie.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (mixHash.length !== 32) {
      const msg = this._errorMsg(
        `mixHash must be 32 bytes, received ${mixHash.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }

    if (nonce.length !== 8) {
      const msg = this._errorMsg(
        `nonce must be 8 bytes, received ${nonce.length} bytes`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }

    // check if the block used too much gas
    if (this.gasUsed > this.gasLimit) {
      const msg = this._errorMsg(
        `Invalid block: too much gas used. Used: ${this.gasUsed}, gas limit: ${this.gasLimit}`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  /**
   * Checks static parameters related to consensus algorithm
   * @throws if any check fails
   */
  protected _consensusFormatValidation() {
    const { number } = this

    // Consensus type dependent checks
    if (this.common.consensusAlgorithm() === ConsensusAlgorithm.Ethash) {
      // PoW/Ethash
      if (
        number > BIGINT_0 &&
        this.extraData.length > this.common.param('maxExtraDataSize')
      ) {
        // Check length of data on all post-genesis blocks
        const msg = this._errorMsg('invalid amount of extra data')
        throw EthereumJSErrorWithoutCode(msg)
      }
    }
  }

  /**
   * Validates if the block gasLimit remains in the boundaries set by the protocol.
   * Throws if out of bounds.
   *
   * @param parentBlockHeader - the header from the parent `Block` of this header
   */
  validateGasLimit(parentBlockHeader: BlockHeader) {
    const parentGasLimit = parentBlockHeader.gasLimit
    const gasLimit = this.gasLimit

    const a = parentGasLimit / this.common.param('gasLimitBoundDivisor')
    const maxGasLimit = parentGasLimit + a
    const minGasLimit = parentGasLimit - a

    if (gasLimit >= maxGasLimit) {
      const msg = this._errorMsg(
        `gas limit increased too much. Gas limit: ${gasLimit}, max gas limit: ${maxGasLimit}`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }

    if (gasLimit <= minGasLimit) {
      const msg = this._errorMsg(
        `gas limit decreased too much. Gas limit: ${gasLimit}, min gas limit: ${minGasLimit}`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }

    if (gasLimit < this.common.param('minGasLimit')) {
      const msg = this._errorMsg(
        `gas limit decreased below minimum gas limit. Gas limit: ${gasLimit}, minimum gas limit: ${this.common.param(
          'minGasLimit',
        )}`,
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  /**
   * Returns a Uint8Array Array of the raw Bytes in this header, in order.
   * Frontier format: 15 fields
   */
  raw(): BlockHeaderBytes {
    return [
      this.parentHash,
      this.uncleHash,
      this.coinbase.bytes,
      this.stateRoot,
      this.transactionsTrie,
      this.receiptTrie,
      this.logsBloom,
      bigIntToUnpaddedBytes(this.difficulty),
      bigIntToUnpaddedBytes(this.number),
      bigIntToUnpaddedBytes(this.gasLimit),
      bigIntToUnpaddedBytes(this.gasUsed),
      bigIntToUnpaddedBytes(this.timestamp ?? BIGINT_0),
      this.extraData,
      this.mixHash,
      this.nonce,
    ]
  }

  /**
   * Returns the hash of the block header.
   */
  hash(): Uint8Array {
    if (Object.isFrozen(this)) {
      this.cache.hash ??= this.keccakFunction(
        RLP.encode(this.raw()),
      ) as Uint8Array
      return this.cache.hash
    }
    return this.keccakFunction(RLP.encode(this.raw()))
  }

  /**
   * Checks if the block header is a genesis header.
   */
  isGenesis(): boolean {
    return this.number === BIGINT_0
  }

  /**
   * Returns the canonical difficulty for this block.
   * Uses Frontier difficulty calculation (pre-Homestead).
   *
   * @param parentBlockHeader - the header from the parent `Block` of this header
   */
  ethashCanonicalDifficulty(parentBlockHeader: BlockHeader): bigint {
    if (this.common.consensusType() !== ConsensusType.ProofOfWork) {
      const msg = this._errorMsg(
        'difficulty calculation is only supported on PoW chains',
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    if (this.common.consensusAlgorithm() !== ConsensusAlgorithm.Ethash) {
      const msg = this._errorMsg(
        'difficulty calculation currently only supports the ethash algorithm',
      )
      throw EthereumJSErrorWithoutCode(msg)
    }
    const blockTs = this.timestamp
    const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader
    const minimumDifficulty = this.common.param('minimumDifficulty')
    const offset = parentDif / this.common.param('difficultyBoundDivisor')

    // Frontier difficulty calculation (pre-Homestead)
    let dif: bigint
    if (parentTs + this.common.param('durationLimit') > blockTs) {
      dif = offset + parentDif
    } else {
      dif = parentDif - offset
    }

    // Ice age / difficulty bomb
    const exp = this.number / BigInt(100000) - BIGINT_2
    if (exp >= 0) {
      dif = dif + BIGINT_2 ** exp
    }

    if (dif < minimumDifficulty) {
      dif = minimumDifficulty
    }

    return dif
  }

  /**
   * Returns the rlp encoding of the block header.
   */
  serialize(): Uint8Array {
    return RLP.encode(this.raw())
  }

  /**
   * Returns the block header in JSON format.
   */
  toJSON(): JSONHeader {
    return {
      parentHash: bytesToHex(this.parentHash),
      uncleHash: bytesToHex(this.uncleHash),
      coinbase: this.coinbase.toString(),
      stateRoot: bytesToHex(this.stateRoot),
      transactionsTrie: bytesToHex(this.transactionsTrie),
      receiptTrie: bytesToHex(this.receiptTrie),
      logsBloom: bytesToHex(this.logsBloom),
      difficulty: bigIntToHex(this.difficulty),
      number: bigIntToHex(this.number),
      gasLimit: bigIntToHex(this.gasLimit),
      gasUsed: bigIntToHex(this.gasUsed),
      timestamp: bigIntToHex(this.timestamp),
      extraData: bytesToHex(this.extraData),
      mixHash: bytesToHex(this.mixHash),
      nonce: bytesToHex(this.nonce),
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
    let errorStr = `block header number=${this.number} hash=${hash} `
    errorStr += `hf=${hf}`
    return errorStr
  }

  /**
   * Helper function to create an annotated error message
   *
   * @param msg Base error message
   * @hidden
   */
  protected _errorMsg(msg: string) {
    return `${msg} (${this.errorStr()})`
  }
}
