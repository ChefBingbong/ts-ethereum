import {
  type AllParamNames,
  ConsensusAlgorithm,
  ConsensusType,
  Hardfork,
  type HardforkManager,
  type HardforkParamsMap,
  type ParamType,
} from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import {
  type Address,
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  bigIntToBytes,
  bigIntToHex,
  bigIntToUnpaddedBytes,
  bytesToHex,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import {
  computeBlobGasPrice,
  numberToHex,
  valuesArrayToHeaderData,
} from './helpers'
import type {
  BlockHeaderBytes,
  BlockOptions,
  HeaderData,
  JSONHeader,
  JSONRPCBlock,
} from './types'
import { validateBlockHeader } from './validation'

interface HeaderCache {
  hash: Uint8Array | undefined
}

/**
 * An object that represents the block header.
 * Uses Zod schema validation for input parsing and type coercion.
 */
export class BlockHeader {
  public readonly parentHash!: Uint8Array
  public readonly uncleHash!: Uint8Array
  public readonly coinbase!: Address
  public readonly stateRoot!: Uint8Array
  public readonly transactionsTrie!: Uint8Array
  public readonly receiptTrie!: Uint8Array
  public readonly logsBloom!: Uint8Array
  public readonly difficulty!: bigint
  public readonly number!: bigint
  public readonly gasLimit!: bigint
  public readonly gasUsed!: bigint
  public readonly timestamp!: bigint
  public readonly extraData!: Uint8Array
  public readonly mixHash!: Uint8Array
  public readonly nonce!: Uint8Array
  public readonly baseFeePerGas?: bigint
  public readonly withdrawalsRoot?: Uint8Array
  public readonly blobGasUsed?: bigint
  public readonly excessBlobGas?: bigint
  public readonly parentBeaconBlockRoot?: Uint8Array
  public readonly requestsHash?: Uint8Array

  public readonly hardforkManager: HardforkManager

  get blockNum() {
    return { blockNumber: this.number, timestamp: this.timestamp }
  }

  /**
   * Gets the hardfork active at this block's number/timestamp
   */
  get hardfork(): string {
    return this.hardforkManager.getHardforkByBlock(this.number, this.timestamp)
  }

  /**
   * Helper to check if an EIP is active at this block
   */
  isEIPActive(eip: number): boolean {
    return this.hardforkManager.isEIPActiveAtBlock(eip, this.blockNum)
  }

  /**
   * Helper to get a param value at this block's hardfork
   */
  param<P extends AllParamNames>(name: P): ParamType<P> | undefined {
    return this.hardforkManager.getParamAtHardfork(name, this.hardfork)
  }

  /**
   * Returns the consensus type from chain config
   */
  get consensusType(): string {
    return this.hardforkManager.config.spec.chain?.consensus?.type ?? 'pow'
  }

  /**
   * Returns the consensus algorithm from chain config
   */
  get consensusAlgorithm(): string {
    return (
      this.hardforkManager.config.spec.chain?.consensus?.algorithm ?? 'ethash'
    )
  }

  protected keccakFunction: (msg: Uint8Array) => Uint8Array
  protected cache: HeaderCache = { hash: undefined }

  get prevRandao(): Uint8Array {
    if (!this.hardforkManager.isEIPActiveAtBlock(4399, this.blockNum)) {
      throw EthereumJSErrorWithoutCode(
        'prevRandao can only be accessed when EIP-4399 is activated',
      )
    }
    return this.mixHash
  }

  constructor(headerData: HeaderData, opts: BlockOptions) {
    // this.common.updatebatchparams // to do
    this.hardforkManager = opts.hardforkManager
    this.keccakFunction = keccak256

    const validatedHeader = validateBlockHeader({
      header: headerData,
      hardforkManager: opts.hardforkManager,
      validateConsensus: !opts.skipConsensusFormatValidation,
    })

    Object.assign(this, validatedHeader)

    this.difficulty = this.ethashCanonicalDifficulty(
      opts.calcDifficultyFromHeader,
    )

    if (opts.freeze !== false) Object.freeze(this)
  }

  /**
   * Static factory method to create a block header from a header data dictionary
   */
  static fromHeaderData(
    headerData: HeaderData,
    opts: BlockOptions,
  ): BlockHeader {
    return new BlockHeader(headerData, opts)
  }

  /**
   * Static factory method to create a block header from an array of bytes values
   */
  static fromBytesArray(
    values: BlockHeaderBytes,
    opts: BlockOptions,
  ): BlockHeader {
    const headerData = valuesArrayToHeaderData(values)
    const {
      number,
      baseFeePerGas,
      excessBlobGas,
      blobGasUsed,
      parentBeaconBlockRoot,
      requestsHash,
    } = headerData
    const header = new BlockHeader(headerData, opts)
    if (
      header.hardforkManager.isEIPActiveAtBlock(1559, header.blockNum) &&
      baseFeePerGas === undefined
    ) {
      const eip1559ActivationBlock = bigIntToBytes(
        header.hardforkManager.hardforkBlock(Hardfork.London)!,
      )
      if (
        eip1559ActivationBlock !== undefined &&
        equalsBytes(eip1559ActivationBlock, number as Uint8Array)
      ) {
        throw EthereumJSErrorWithoutCode(
          'invalid header. baseFeePerGas should be provided',
        )
      }
    }
    if (header.hardforkManager.isEIPActiveAtBlock(4844, header.blockNum)) {
      if (excessBlobGas === undefined) {
        throw EthereumJSErrorWithoutCode(
          'invalid header. excessBlobGas should be provided',
        )
      } else if (blobGasUsed === undefined) {
        throw EthereumJSErrorWithoutCode(
          'invalid header. blobGasUsed should be provided',
        )
      }
    }
    if (
      header.hardforkManager.isEIPActiveAtBlock(4788, header.blockNum) &&
      parentBeaconBlockRoot === undefined
    ) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. parentBeaconBlockRoot should be provided',
      )
    }
    if (
      header.hardforkManager.isEIPActiveAtBlock(7685, header.blockNum) &&
      requestsHash === undefined
    ) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. requestsHash should be provided',
      )
    }
    return header
  }

  /**
   * Static factory method to create a block header from a RLP-serialized header
   */
  static fromRLP(
    serializedHeaderData: Uint8Array,
    opts: BlockOptions,
  ): BlockHeader {
    const values = RLP.decode(serializedHeaderData)
    if (!Array.isArray(values)) {
      throw EthereumJSErrorWithoutCode(
        'Invalid serialized header input. Must be array',
      )
    }
    return BlockHeader.fromBytesArray(values as Uint8Array[], opts)
  }

  /**
   * Static factory method to create a block header from Ethereum JSON RPC
   */
  static fromRPC(
    blockParams: JSONRPCBlock,
    options: BlockOptions,
  ): BlockHeader {
    const {
      parentHash,
      sha3Uncles,
      miner,
      stateRoot,
      transactionsRoot,
      receiptsRoot,
      logsBloom,
      difficulty,
      number,
      gasLimit,
      gasUsed,
      timestamp,
      extraData,
      mixHash,
      nonce,
      baseFeePerGas,
      withdrawalsRoot,
      blobGasUsed,
      excessBlobGas,
      parentBeaconBlockRoot,
      requestsHash,
    } = blockParams

    return new BlockHeader(
      {
        parentHash,
        uncleHash: sha3Uncles,
        coinbase: miner,
        stateRoot,
        transactionsTrie: transactionsRoot,
        receiptTrie: receiptsRoot,
        logsBloom,
        difficulty: numberToHex(difficulty),
        number,
        gasLimit,
        gasUsed,
        timestamp,
        extraData,
        mixHash,
        nonce,
        baseFeePerGas,
        withdrawalsRoot,
        blobGasUsed,
        excessBlobGas,
        parentBeaconBlockRoot,
        requestsHash,
      },
      options,
    )
  }

  validateGasLimit(parentBlockHeader: { gasLimit: bigint }): void {
    let parentGasLimit = parentBlockHeader.gasLimit
    const londonHfBlock = this.hardforkManager.hardforkBlock(Hardfork.London)

    if (
      typeof londonHfBlock === 'bigint' &&
      londonHfBlock !== BIGINT_0 &&
      this.number === londonHfBlock
    ) {
      const elasticity = this.param('elasticityMultiplier')
      if (elasticity !== undefined) {
        parentGasLimit = parentGasLimit * BigInt(elasticity)
      }
    }

    const gasLimit = this.gasLimit

    const a = parentGasLimit / BigInt(this.param('gasLimitBoundDivisor') ?? 0n)
    const maxGasLimit = parentGasLimit + a
    const minGasLimit = parentGasLimit - a

    if (gasLimit >= maxGasLimit) {
      throw EthereumJSErrorWithoutCode(
        `gas limit increased too much: ${gasLimit} >= ${maxGasLimit}`,
      )
    }
    if (gasLimit <= minGasLimit) {
      throw EthereumJSErrorWithoutCode(
        `gas limit decreased too much: ${gasLimit} <= ${minGasLimit}`,
      )
    }
    if (gasLimit < minGasLimit) {
      throw EthereumJSErrorWithoutCode(
        `gas limit below minimum: ${gasLimit} < ${minGasLimit}`,
      )
    }
  }

  calcNextBaseFee(): bigint {
    if (!this.isEIPActive(1559)) {
      throw EthereumJSErrorWithoutCode(
        'calcNextBaseFee() requires EIP1559 activation',
      )
    }

    const elasticity = BigInt(this.param('elasticityMultiplier') ?? 0n)
    const parentGasTarget = this.gasLimit / elasticity

    if (parentGasTarget === this.gasUsed) {
      return this.baseFeePerGas!
    }

    const denominator = this.param('baseFeeMaxChangeDenominator') ?? 8n

    if (this.gasUsed > parentGasTarget) {
      const delta = this.gasUsed - parentGasTarget
      const calc = (this.baseFeePerGas! * delta) / parentGasTarget / denominator
      return (calc > BIGINT_1 ? calc : BIGINT_1) + this.baseFeePerGas!
    }

    const delta = parentGasTarget - this.gasUsed
    const calc = (this.baseFeePerGas! * delta) / parentGasTarget / denominator
    const result = this.baseFeePerGas! - calc
    return result > BIGINT_0 ? result : BIGINT_0
  }

  getBlobGasPrice(): bigint {
    if (this.excessBlobGas === undefined) {
      throw EthereumJSErrorWithoutCode('excessBlobGas field not populated')
    }
    return computeBlobGasPrice(
      this.excessBlobGas,
      this.hardforkManager,
      this.hardfork,
    )
  }

  calcDataFee(numBlobs: number): bigint {
    const blobGasPerBlob = this.param('blobGasPerBlob') ?? 0n
    return blobGasPerBlob * BigInt(numBlobs) * this.getBlobGasPrice()
  }

  calcNextExcessBlobGas(childHardfork: string): bigint {
    const excessBlobGas = this.excessBlobGas ?? BIGINT_0
    const blobGasUsed = this.blobGasUsed ?? BIGINT_0

    const targetBlobGasPerBlock =
      this.hardforkManager.getParamAtHardfork(
        'targetBlobGasPerBlock',
        childHardfork,
      ) ?? BIGINT_0
    const maxBlobGasPerBlock =
      this.hardforkManager.getParamAtHardfork(
        'maxBlobGasPerBlock',
        childHardfork,
      ) ?? BIGINT_0

    if (excessBlobGas + blobGasUsed < targetBlobGasPerBlock) {
      return BIGINT_0
    }

    if (this.hardforkManager.isEIPActiveAtHardfork(7918, childHardfork)) {
      const blobBaseCost =
        this.hardforkManager.getParamAtHardfork(
          'blobBaseCost',
          childHardfork,
        ) ?? BIGINT_0
      const gasPerBlob =
        this.hardforkManager.getParamAtHardfork(
          'blobGasPerBlob',
          childHardfork,
        ) ?? 0n
      const baseFee = this.baseFeePerGas ?? BIGINT_0
      const blobFee = this.getBlobGasPrice()

      if (blobBaseCost * baseFee > gasPerBlob * blobFee) {
        const increase =
          (blobGasUsed * (maxBlobGasPerBlock - targetBlobGasPerBlock)) /
          maxBlobGasPerBlock
        return excessBlobGas + increase
      }
    }

    return excessBlobGas + blobGasUsed - targetBlobGasPerBlock
  }

  calcNextBlobGasPrice(childHardfork: string): bigint {
    return computeBlobGasPrice(
      this.calcNextExcessBlobGas(childHardfork),
      this.hardforkManager,
      childHardfork,
    )
  }

  raw(): BlockHeaderBytes {
    const rawItems: Uint8Array[] = [
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

    if (this.isEIPActive(1559)) {
      rawItems.push(bigIntToUnpaddedBytes(this.baseFeePerGas!))
    }
    if (this.isEIPActive(4895)) {
      rawItems.push(this.withdrawalsRoot!)
    }
    if (this.isEIPActive(4844)) {
      rawItems.push(bigIntToUnpaddedBytes(this.blobGasUsed!))
      rawItems.push(bigIntToUnpaddedBytes(this.excessBlobGas!))
    }
    if (this.isEIPActive(4788)) {
      rawItems.push(this.parentBeaconBlockRoot!)
    }
    if (this.isEIPActive(7685)) {
      rawItems.push(this.requestsHash!)
    }

    return rawItems
  }

  hash(): Uint8Array {
    if (Object.isFrozen(this)) {
      this.cache.hash ??= this.keccakFunction(RLP.encode(this.raw()))
      return this.cache.hash
    }
    return this.keccakFunction(RLP.encode(this.raw()))
  }

  isGenesis(): boolean {
    return this.number === BIGINT_0
  }

  ethashCanonicalDifficulty(
    parentBlockHeader:
      | {
          timestamp: bigint
          difficulty: bigint
          uncleHash: Uint8Array
        }
      | undefined,
  ): bigint {
    if (
      !parentBlockHeader ||
      this.consensusAlgorithm !== ConsensusAlgorithm.Ethash
    ) {
      return this.difficulty
    }
    if (this.consensusType !== ConsensusType.ProofOfWork) {
      throw EthereumJSErrorWithoutCode(
        'difficulty calculation only supported on PoW chains',
      )
    }
    if (this.consensusAlgorithm !== ConsensusAlgorithm.Ethash) {
      throw EthereumJSErrorWithoutCode(
        'difficulty calculation only supports ethash algorithm',
      )
    }

    const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader
    const blockTs = this.timestamp

    // Get EIP-1 params (base difficulty params) at current hardfork
    const params = this.hardforkManager.getParamsAtHardfork(
      this.hardfork as keyof HardforkParamsMap,
    )
    const minimumDifficulty = params.minimumDifficulty ?? 0n
    const difficultyBoundDivisor = params.difficultyBoundDivisor ?? 0n
    const offset = parentDif / difficultyBoundDivisor

    let num = this.number
    let dif!: bigint

    if (this.hardforkManager.hardforkGte(this.hardfork, Hardfork.Byzantium)) {
      const uncleAddend = equalsBytes(
        parentBlockHeader.uncleHash,
        KECCAK256_RLP_ARRAY,
      )
        ? 1
        : 2
      let a = BigInt(uncleAddend) - (blockTs - parentTs) / BigInt(9)
      if (BigInt(-99) > a) a = BigInt(-99)
      dif = parentDif + offset * a
      const difficultyBombDelay = params.difficultyBombDelay ?? BIGINT_0
      num = num - difficultyBombDelay
      if (num < BIGINT_0) num = BIGINT_0
    } else if (
      this.hardforkManager.hardforkGte(this.hardfork, Hardfork.Homestead)
    ) {
      let a = BIGINT_1 - (blockTs - parentTs) / BigInt(10)
      if (BigInt(-99) > a) a = BigInt(-99)
      dif = parentDif + offset * a
    } else {
      const durationLimit = params.durationLimit ?? 13n
      dif =
        parentTs + durationLimit > blockTs
          ? offset + parentDif
          : parentDif - offset
    }

    const exp = num / BigInt(100000) - BIGINT_2
    if (exp >= 0) dif = dif + BIGINT_2 ** exp
    if (dif < minimumDifficulty) dif = minimumDifficulty

    return dif
  }

  serialize(): Uint8Array {
    return RLP.encode(this.raw())
  }

  toJSON(): JSONHeader {
    const withdrawalAttr = this.withdrawalsRoot
      ? { withdrawalsRoot: bytesToHex(this.withdrawalsRoot) }
      : {}
    const JSONDict: JSONHeader = {
      parentHash: bytesToHex(this.parentHash),
      uncleHash: bytesToHex(this.uncleHash),
      coinbase: this.coinbase.toString(),
      stateRoot: bytesToHex(this.stateRoot),
      transactionsTrie: bytesToHex(this.transactionsTrie),
      ...withdrawalAttr,
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
    if (this.isEIPActive(1559)) {
      JSONDict.baseFeePerGas = bigIntToHex(this.baseFeePerGas!)
    }
    if (this.isEIPActive(4844)) {
      JSONDict.blobGasUsed = bigIntToHex(this.blobGasUsed!)
      JSONDict.excessBlobGas = bigIntToHex(this.excessBlobGas!)
    }
    if (this.isEIPActive(4788)) {
      JSONDict.parentBeaconBlockRoot = bytesToHex(this.parentBeaconBlockRoot!)
    }
    if (this.isEIPActive(7685)) {
      JSONDict.requestsHash = bytesToHex(this.requestsHash!)
    }
    return JSONDict
  }

  protected _consensusFormatValidation(): void {
    validateBlockHeader({
      header: this,
      hardforkManager: this.hardforkManager,
      validateConsensus: true,
    })
  }
}
