import {
  ConsensusAlgorithm,
  ConsensusType,
  GlobalConfig,
  Hardfork,
  mainnetSchema,
  paramsBlock,
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
  equalsBytes,
  EthereumJSErrorWithoutCode,
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
import { validateBlockHeader, zCoreHeaderSchema } from './validation'

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

  public readonly common: GlobalConfig

  protected keccakFunction: (msg: Uint8Array) => Uint8Array
  protected cache: HeaderCache = { hash: undefined }

  get prevRandao(): Uint8Array {
    if (!this.common.isActivatedEIP(4399)) {
      throw EthereumJSErrorWithoutCode(
        'prevRandao can only be accessed when EIP-4399 is activated',
      )
    }
    return this.mixHash
  }

  constructor(headerData: HeaderData, opts: BlockOptions = {}) {
    if (opts.common) this.common = opts.common.copy()
    else {
      this.common = GlobalConfig.fromSchema({
        schema: mainnetSchema,
        hardfork: Hardfork.Prague,
      })
    }
    this.common.updateBatchParams(opts.params ?? paramsBlock)
    this.keccakFunction = this.common.customCrypto.keccak256 ?? keccak256

    if (opts.setHardfork === true) {
      const { number, timestamp } = zCoreHeaderSchema.parse(headerData)
      this.common.setHardforkBy({ blockNumber: number, timestamp })
    }

    const validatedHeader = validateBlockHeader({
      header: headerData,
      common: this.common,
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
    headerData: HeaderData = {},
    opts: BlockOptions = {},
  ): BlockHeader {
    return new BlockHeader(headerData, opts)
  }

  /**
   * Static factory method to create a block header from an array of bytes values
   */
  static fromBytesArray(
    values: BlockHeaderBytes,
    opts: BlockOptions = {},
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
    if (header.common.isActivatedEIP(1559) && baseFeePerGas === undefined) {
      const eip1559ActivationBlock = bigIntToBytes(
        header.common.eipBlock(1559)!,
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
    if (header.common.isActivatedEIP(4844)) {
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
      header.common.isActivatedEIP(4788) &&
      parentBeaconBlockRoot === undefined
    ) {
      throw EthereumJSErrorWithoutCode(
        'invalid header. parentBeaconBlockRoot should be provided',
      )
    }
    if (header.common.isActivatedEIP(7685) && requestsHash === undefined) {
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
    opts: BlockOptions = {},
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
    options?: BlockOptions,
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
    const londonHfBlock = this.common.hardforkBlock(Hardfork.London)

    if (
      typeof londonHfBlock === 'bigint' &&
      londonHfBlock !== BIGINT_0 &&
      this.number === londonHfBlock
    ) {
      parentGasLimit *= this.common.getParamByEIP(1559, 'elasticityMultiplier')
    }

    const a = parentGasLimit / BigInt(this.common.param('gasLimitBoundDivisor'))
    const maxGasLimit = parentGasLimit + a
    const minGasLimit = parentGasLimit - a

    if (this.gasLimit >= maxGasLimit) {
      throw EthereumJSErrorWithoutCode(
        `gas limit increased too much: ${this.gasLimit} >= ${maxGasLimit}`,
      )
    }
    if (this.gasLimit <= minGasLimit) {
      throw EthereumJSErrorWithoutCode(
        `gas limit decreased too much: ${this.gasLimit} <= ${minGasLimit}`,
      )
    }
    if (this.gasLimit < this.common.param('minGasLimit')) {
      throw EthereumJSErrorWithoutCode(
        `gas limit below minimum: ${this.gasLimit} < ${this.common.param('minGasLimit')}`,
      )
    }
  }

  calcNextBaseFee(): bigint {
    if (!this.common.isActivatedEIP(1559)) {
      throw EthereumJSErrorWithoutCode(
        'calcNextBaseFee() requires EIP1559 activation',
      )
    }

    const elasticity = this.common.getParamByEIP(1559, 'elasticityMultiplier')
    const parentGasTarget = this.gasLimit / elasticity

    if (parentGasTarget === this.gasUsed) {
      return this.baseFeePerGas!
    }

    const denominator = this.common.getParamByEIP(
      1559,
      'baseFeeMaxChangeDenominator',
    )

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
    return computeBlobGasPrice(this.excessBlobGas, this.common)
  }

  calcDataFee(numBlobs: number): bigint {
    const blobGasPerBlob = this.common.getParamByEIP(4844, 'blobGasPerBlob')
    return blobGasPerBlob * BigInt(numBlobs) * this.getBlobGasPrice()
  }

  calcNextExcessBlobGas(childCommon: GlobalConfig): bigint {
    const excessBlobGas = this.excessBlobGas ?? BIGINT_0
    const blobGasUsed = this.blobGasUsed ?? BIGINT_0
    const { targetBlobGasPerBlock, maxBlobGasPerBlock } =
      childCommon.getBlobGasSchedule()

    if (excessBlobGas + blobGasUsed < targetBlobGasPerBlock) {
      return BIGINT_0
    }

    if (childCommon.isActivatedEIP(7918)) {
      const blobBaseCost = childCommon.param('blobBaseCost')!
      const gasPerBlob = childCommon.getParamByEIP(4844, 'blobGasPerBlob')
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

  calcNextBlobGasPrice(childCommon: GlobalConfig): bigint {
    return computeBlobGasPrice(
      this.calcNextExcessBlobGas(childCommon),
      childCommon,
    )
  }

  raw(): BlockHeaderBytes {
    const rawItems = [
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

    if (this.common.isActivatedEIP(1559)) {
      rawItems.push(bigIntToUnpaddedBytes(this.baseFeePerGas!))
    }
    if (this.common.isActivatedEIP(4895)) {
      rawItems.push(this.withdrawalsRoot!)
    }
    if (this.common.isActivatedEIP(4844)) {
      rawItems.push(bigIntToUnpaddedBytes(this.blobGasUsed!))
      rawItems.push(bigIntToUnpaddedBytes(this.excessBlobGas!))
    }
    if (this.common.isActivatedEIP(4788)) {
      rawItems.push(this.parentBeaconBlockRoot!)
    }
    if (this.common.isActivatedEIP(7685)) {
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
      this.common.consensusAlgorithm() !== ConsensusAlgorithm.Ethash
    ) {
      return this.difficulty
    }
    if (this.common.consensusType() !== ConsensusType.ProofOfWork) {
      throw EthereumJSErrorWithoutCode(
        'difficulty calculation only supported on PoW chains',
      )
    }
    if (this.common.consensusAlgorithm() !== ConsensusAlgorithm.Ethash) {
      throw EthereumJSErrorWithoutCode(
        'difficulty calculation only supports ethash algorithm',
      )
    }

    const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader
    const blockTs = this.timestamp

    console.log(parentTs, blockTs, parentDif)
    const manager = this.common._hardforkParams.getEIPParams(1)
    const minimumDifficulty = manager['minimumDifficulty']
    const offset = parentDif / manager['difficultyBoundDivisor']

    let num = this.number
    let dif!: bigint

    if (this.common.gteHardfork(Hardfork.Byzantium)) {
      const uncleAddend = equalsBytes(
        parentBlockHeader.uncleHash,
        KECCAK256_RLP_ARRAY,
      )
        ? 1
        : 2
      let a = BigInt(uncleAddend) - (blockTs - parentTs) / BigInt(9)
      if (BigInt(-99) > a) a = BigInt(-99)
      dif = parentDif + offset * a
      num = num - manager['difficultyBombDelay']
      if (num < BIGINT_0) num = BIGINT_0
    } else if (this.common.gteHardfork(Hardfork.Homestead)) {
      let a = BIGINT_1 - (blockTs - parentTs) / BigInt(10)
      if (BigInt(-99) > a) a = BigInt(-99)
      dif = parentDif + offset * a
    } else {
      dif =
        parentTs + manager['durationLimit'] > blockTs
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
    const json: JSONHeader = {
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

    if (this.withdrawalsRoot) {
      json.withdrawalsRoot = bytesToHex(this.withdrawalsRoot)
    }
    if (this.common.isActivatedEIP(1559)) {
      json.baseFeePerGas = bigIntToHex(this.baseFeePerGas!)
    }
    if (this.common.isActivatedEIP(4844)) {
      json.blobGasUsed = bigIntToHex(this.blobGasUsed!)
      json.excessBlobGas = bigIntToHex(this.excessBlobGas!)
    }
    if (this.common.isActivatedEIP(4788)) {
      json.parentBeaconBlockRoot = bytesToHex(this.parentBeaconBlockRoot!)
    }
    if (this.common.isActivatedEIP(7685)) {
      json.requestsHash = bytesToHex(this.requestsHash!)
    }

    return json
  }

  protected _consensusFormatValidation(): void {
    validateBlockHeader({
      header: this,
      common: this.common,
      validateConsensus: true,
    })
  }
}
