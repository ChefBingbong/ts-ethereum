import {
  type AllParamNames,
  EIP,
  type HardforkManager,
  type ParamType,
} from '@ts-ethereum/chain-config'
import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import {
  Blob4844Tx,
  Capability,
  createTx,
  createTxFromBlockBodyData,
  createTxFromRLP,
  type FeeMarket1559Tx,
  type LegacyTx,
  normalizeTxParams,
  type TypedTransaction,
} from '@ts-ethereum/tx'
import type { EthersProvider, WithdrawalBytes } from '@ts-ethereum/utils'
import {
  BIGINT_0,
  bigIntToHex,
  bytesToHex,
  createWithdrawal,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  fetchFromProvider,
  getProvider,
  hexToBytes,
  intToHex,
  isHexString,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  type Withdrawal,
} from '@ts-ethereum/utils'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { sha256 } from 'ethereum-cryptography/sha256.js'
import { generateCliqueBlockExtraData } from './consensus/clique'
import { BlockHeader } from './header'
import { genTransactionsTrieRoot, genWithdrawalsTrieRoot } from './helpers'
import type {
  BlockBytes,
  BlockData,
  BlockOptions,
  ExecutionPayload,
  HeaderData,
  JSONBlock,
  JSONRPCBlock,
  WithdrawalsBytes,
} from './types'
import {
  validateBlockConstructor,
  validateUncleHeaders,
} from './validation/block'

export class Block {
  public readonly header: BlockHeader
  public readonly transactions: TypedTransaction[] = []
  public readonly uncleHeaders: BlockHeader[] = []
  public readonly withdrawals?: Withdrawal[]
  public readonly hardforkManager: HardforkManager
  protected keccakFunction: (msg: Uint8Array) => Uint8Array
  protected sha256Function: (msg: Uint8Array) => Uint8Array

  protected cache: {
    txTrieRoot?: Uint8Array
    withdrawalsTrieRoot?: Uint8Array
  } = {}

  /**
   * Helper to check if an EIP is active at this block
   */
  isEIPActive(eip: number): boolean {
    return this.header.isEIPActive(eip)
  }

  /**
   * Helper to get a param value at this block's hardfork
   */
  param<P extends AllParamNames>(name: P): ParamType<P> | undefined {
    return this.header.param(name)
  }

  /**
   * Gets the hardfork active at this block
   */
  get hardfork(): string {
    return this.header.hardfork
  }

  constructor(
    header: BlockHeader,
    transactions: TypedTransaction[],
    uncleHeaders: BlockHeader[],
    withdrawals: Withdrawal[] | undefined,
    opts: BlockOptions,
  ) {
    this.header = header
    this.hardforkManager = opts.hardforkManager
    this.keccakFunction = keccak256
    this.sha256Function = sha256

    // Validate block data using Zod schema
    const validated = validateBlockConstructor(
      {
        uncleHeaders,
        withdrawals,
        isGenesis: this.header.isGenesis(),
      },
      { hardforkManager: this.hardforkManager, number: this.header.number },
      this.header.number,
    )

    this.transactions = transactions
    this.uncleHeaders = validated.uncleHeaders
    this.withdrawals = validated.withdrawals

    if (opts?.freeze !== false) {
      Object.freeze(this)
    }
  }

  static fromBlockData(blockData: BlockData, opts: BlockOptions): Block {
    const {
      header: headerData,
      transactions: txsData,
      uncleHeaders: uhsData,
      withdrawals: withdrawalsData,
    } = blockData

    const header = BlockHeader.fromHeaderData(headerData ?? {}, opts)

    // parse transactions
    const transactions = []
    for (const txData of txsData ?? []) {
      // TODO: Migrate tx package to use hardforkManager
      const tx = createTx(txData, opts)
      transactions.push(tx)
    }

    // parse uncle headers
    const uncleHeaders = []
    const uncleOpts: BlockOptions = {
      ...opts,
      hardforkManager: opts.hardforkManager,
      calcDifficultyFromHeader: undefined,
    }
    if (opts?.setHardfork !== undefined) {
      uncleOpts.setHardfork = true
    }
    for (const uhData of uhsData ?? []) {
      const uh = BlockHeader.fromHeaderData(uhData, uncleOpts)
      uncleHeaders.push(uh)
    }

    const withdrawals = withdrawalsData?.map(createWithdrawal)

    return new Block(header, transactions, uncleHeaders, withdrawals, opts)
  }

  static createEmpty(headerData: HeaderData, opts: BlockOptions): Block {
    const header = BlockHeader.fromHeaderData(headerData, opts)
    return new Block(header, [], [], undefined, opts)
  }

  static fromBytesArray(values: BlockBytes, opts: BlockOptions): Block {
    if (values.length > 5) {
      throw EthereumJSErrorWithoutCode(
        `invalid  More values=${values.length} than expected were received (at most 5)`,
      )
    }

    const [headerData, txsData, uhsData, ...valuesTail] = values
    const header = BlockHeader.fromBytesArray(headerData, opts)

    const withdrawalBytes = header.isEIPActive(4895)
      ? (valuesTail.splice(0, 1)[0] as WithdrawalsBytes)
      : undefined

    if (
      header.isEIPActive(4895) &&
      (withdrawalBytes === undefined || !Array.isArray(withdrawalBytes))
    ) {
      throw EthereumJSErrorWithoutCode(
        'Invalid serialized block input: EIP-4895 is active, and no withdrawals were provided as array',
      )
    }

    const transactions = []
    for (const txData of txsData ?? []) {
      // TODO: Migrate tx package to use hardforkManager
      transactions.push(createTxFromBlockBodyData(txData, opts))
    }

    const uncleHeaders = []
    const uncleOpts: BlockOptions = {
      ...opts,
      hardforkManager: header.hardforkManager,
      calcDifficultyFromHeader: undefined,
    }
    if (opts?.setHardfork !== undefined) {
      uncleOpts.setHardfork = true
    }
    for (const uncleHeaderData of uhsData ?? []) {
      uncleHeaders.push(BlockHeader.fromBytesArray(uncleHeaderData, uncleOpts))
    }

    const withdrawals = (withdrawalBytes as WithdrawalBytes[])
      ?.map(([index, validatorIndex, address, amount]) => ({
        index,
        validatorIndex,
        address,
        amount,
      }))
      ?.map(createWithdrawal)

    return new Block(header, transactions, uncleHeaders, withdrawals, opts)
  }

  static fromRLP(serialized: Uint8Array, opts: BlockOptions): Block {
    if (opts.hardforkManager.isEIPActiveAtHardfork(7934, 'osaka')) {
      const maxRlpBlockSize =
        opts.hardforkManager.getParamAtHardfork('maxRlpBlockSize', 'osaka') ??
        1000000000n
      if (serialized.length > maxRlpBlockSize) {
        throw EthereumJSErrorWithoutCode(
          `Block size exceeds limit: ${serialized.length} > ${maxRlpBlockSize}`,
        )
      }
    }
    const values = RLP.decode(Uint8Array.from(serialized)) as BlockBytes

    if (!Array.isArray(values)) {
      throw EthereumJSErrorWithoutCode(
        'Invalid serialized block input. Must be array',
      )
    }

    return Block.fromBytesArray(values, opts)
  }

  static fromRPC(
    blockParams: JSONRPCBlock,
    uncles: any[],
    options: BlockOptions,
  ): Block {
    const header = BlockHeader.fromRPC(blockParams, options)

    const transactions: TypedTransaction[] = []
    // TODO: Migrate tx package to use hardforkManager
    for (const _txParams of blockParams.transactions ?? []) {
      const txParams = normalizeTxParams(_txParams)
      const tx = createTx(txParams, options)
      transactions.push(tx)
    }

    const uncleHeaders = uncles.map((uh) => BlockHeader.fromRPC(uh, options))

    return Block.fromBlockData(
      {
        header,
        transactions,
        uncleHeaders,
        withdrawals: blockParams.withdrawals,
      },
      options,
    )
  }

  static async fromJSONRPCProvider(
    provider: string | EthersProvider,
    blockTag: string | bigint,
    opts: BlockOptions,
  ): Promise<Block> {
    let blockData
    const providerUrl = getProvider(provider)

    if (typeof blockTag === 'string' && blockTag.length === 66) {
      blockData = await fetchFromProvider(providerUrl, {
        method: 'eth_getBlockByHash',
        params: [blockTag, true],
      })
    } else if (typeof blockTag === 'bigint') {
      blockData = await fetchFromProvider(providerUrl, {
        method: 'eth_getBlockByNumber',
        params: [bigIntToHex(blockTag), true],
      })
    } else if (
      isHexString(blockTag) ||
      blockTag === 'latest' ||
      blockTag === 'earliest' ||
      blockTag === 'pending' ||
      blockTag === 'finalized' ||
      blockTag === 'safe'
    ) {
      blockData = await fetchFromProvider(providerUrl, {
        method: 'eth_getBlockByNumber',
        params: [blockTag, true],
      })
    } else {
      throw EthereumJSErrorWithoutCode(
        `expected blockTag to be block hash, bigint, hex prefixed string, or earliest/latest/pending; got ${blockTag}`,
      )
    }

    if (blockData === null) {
      throw EthereumJSErrorWithoutCode('No block data returned from provider')
    }

    const uncleHeaders = []
    if (blockData.uncles.length > 0) {
      for (let x = 0; x < blockData.uncles.length; x++) {
        const headerData = await fetchFromProvider(providerUrl, {
          method: 'eth_getUncleByBlockHashAndIndex',
          params: [blockData.hash, intToHex(x)],
        })
        uncleHeaders.push(headerData)
      }
    }

    return Block.fromRPC(blockData, uncleHeaders, opts)
  }

  static async fromExecutionPayload(
    payload: ExecutionPayload,
    opts: BlockOptions,
  ): Promise<Block> {
    const {
      blockNumber: number,
      receiptsRoot: receiptTrie,
      prevRandao: mixHash,
      feeRecipient: coinbase,
      transactions,
      withdrawals: withdrawalsData,
    } = payload

    const txs = []
    for (const [index, serializedTx] of transactions.entries()) {
      try {
        // TODO: Migrate tx package to use hardforkManager
        const tx = createTxFromRLP(hexToBytes(serializedTx), opts)
        txs.push(tx)
      } catch (error) {
        const validationError = `Invalid tx at index ${index}: ${error}`
        throw validationError
      }
    }

    const transactionsTrie = await genTransactionsTrieRoot(
      txs,
      new MerklePatriciaTrie({ common: opts.hardforkManager }),
    )
    const withdrawals = withdrawalsData?.map((wData) => createWithdrawal(wData))
    const withdrawalsRoot = withdrawals
      ? await genWithdrawalsTrieRoot(
          withdrawals,
          new MerklePatriciaTrie({ common: opts.hardforkManager }),
        )
      : undefined

    const header: HeaderData = {
      ...payload,
      number,
      receiptTrie,
      transactionsTrie,
      withdrawalsRoot,
      mixHash,
      coinbase,
    }

    const block = Block.fromBlockData(
      { header, transactions: txs, withdrawals },
      opts,
    )
    if (!equalsBytes(block.hash(), hexToBytes(payload.blockHash))) {
      const validationError = `Invalid blockHash, expected: ${
        payload.blockHash
      }, received: ${bytesToHex(block.hash())}`
      throw Error(validationError)
    }

    return block
  }

  static createSealedClique(
    cliqueSigner: Uint8Array,
    blockData: BlockData,
    opts: BlockOptions,
  ): Block {
    const sealedCliqueBlock = Block.fromBlockData(blockData, {
      ...opts,
      freeze: false,
      skipConsensusFormatValidation: true,
    })
    ;(sealedCliqueBlock.header.extraData as any) = generateCliqueBlockExtraData(
      sealedCliqueBlock.header,
      cliqueSigner,
    )
    if (opts?.freeze === true) {
      Object.freeze(sealedCliqueBlock)
    }
    if (opts?.skipConsensusFormatValidation === false) {
      sealedCliqueBlock.header['_consensusFormatValidation']()
    }
    return sealedCliqueBlock
  }

  raw(): BlockBytes {
    const bytesArray: BlockBytes = [
      this.header.raw(),
      this.transactions.map((tx) =>
        tx.supports(Capability.EIP2718TypedTransaction)
          ? tx.serialize()
          : tx.raw(),
      ) as Uint8Array[],
      this.uncleHeaders.map((uh) => uh.raw()),
    ]
    const withdrawalsRaw = this.withdrawals?.map((wt) => wt.raw())
    if (withdrawalsRaw) {
      bytesArray.push(withdrawalsRaw)
    }

    return bytesArray
  }

  hash(): Uint8Array {
    return this.header.hash()
  }

  isGenesis(): boolean {
    return this.header.isGenesis()
  }

  serialize(): Uint8Array {
    return RLP.encode(this.raw())
  }

  async genTxTrie(): Promise<Uint8Array> {
    return genTransactionsTrieRoot(this.transactions, new MerklePatriciaTrie())
  }

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

  getTransactionsValidationErrors(): string[] {
    const errors: string[] = []
    let blobGasUsed = BIGINT_0

    // eslint-disable-next-line prefer-const
    for (let [i, tx] of this.transactions.entries()) {
      const errs = tx.getValidationErrors()
      if (this.isEIPActive(1559)) {
        if (tx.supports(Capability.EIP1559FeeMarket)) {
          tx = tx as FeeMarket1559Tx
          if (tx.maxFeePerGas < this.header.baseFeePerGas!) {
            errs.push('tx unable to pay base fee (EIP-1559 tx)')
          }
        } else {
          tx = tx as LegacyTx
          if (tx.gasPrice < this.header.baseFeePerGas!) {
            errs.push('tx unable to pay base fee (non EIP-1559 tx)')
          }
        }
      }
      if (this.isEIPActive(4844)) {
        const blobGasLimit = this.param('maxBlobGasPerBlock') ?? BIGINT_0
        const blobGasPerBlob = this.param('blobGasPerBlob') ?? 131072n
        if (tx instanceof Blob4844Tx) {
          blobGasUsed += BigInt(tx.numBlobs()) * blobGasPerBlob
          if (blobGasUsed > blobGasLimit) {
            errs.push(
              `tx causes total blob gas of ${blobGasUsed} to exceed maximum blob gas per block of ${blobGasLimit}`,
            )
          }
        }
      }
      if (errs.length > 0) {
        errors.push(`errors at tx ${i}: ${errs.join(', ')}`)
      }
    }

    if (this.isEIPActive(4844)) {
      if (blobGasUsed !== this.header.blobGasUsed) {
        errors.push(
          `invalid blobGasUsed expected=${this.header.blobGasUsed} actual=${blobGasUsed}`,
        )
      }
    }

    return errors
  }

  transactionsAreValid(): boolean {
    const errors = this.getTransactionsValidationErrors()

    return errors.length === 0
  }

  async validateData(
    onlyHeader = false,
    verifyTxs = true,
    validateBlockSize = false,
  ): Promise<void> {
    // EIP-7934: RLP Execution Block Size Limit validation
    if (validateBlockSize && this.isEIPActive(EIP.EIP_7934)) {
      const rlpEncoded = this.serialize()
      const maxRlpBlockSize = this.param('maxRlpBlockSize') ?? 1000000000n
      if (rlpEncoded.length > maxRlpBlockSize) {
        const msg = this._errorMsg(
          `Block size exceeds maximum RLP block size limit: ${rlpEncoded.length} bytes > ${maxRlpBlockSize} bytes`,
        )
        throw EthereumJSErrorWithoutCode(msg)
      }
    }

    if (verifyTxs) {
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

    if (verifyTxs) {
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

    if (this.isEIPActive(4895) && !(await this.withdrawalsTrieIsValid())) {
      const msg = this._errorMsg('invalid withdrawals trie')
      throw EthereumJSErrorWithoutCode(msg)
    }
  }

  validateBlobTransactions(parentHeader: BlockHeader) {
    if (this.isEIPActive(4844)) {
      const blobGasLimit = this.param('maxBlobGasPerBlock') ?? BIGINT_0
      const blobGasPerBlob = this.param('blobGasPerBlob') ?? 131072n
      let blobGasUsed = BIGINT_0

      const expectedExcessBlobGas = parentHeader.calcNextExcessBlobGas(
        this.hardfork,
      )
      if (this.header.excessBlobGas !== expectedExcessBlobGas) {
        throw EthereumJSErrorWithoutCode(
          `block excessBlobGas mismatch: have ${this.header.excessBlobGas}, want ${expectedExcessBlobGas}`,
        )
      }

      let blobGasPrice

      for (const tx of this.transactions) {
        if (tx instanceof Blob4844Tx) {
          blobGasPrice = blobGasPrice ?? this.header.getBlobGasPrice()
          if (tx.maxFeePerBlobGas < blobGasPrice) {
            throw EthereumJSErrorWithoutCode(
              `blob transaction maxFeePerBlobGas ${
                tx.maxFeePerBlobGas
              } < than block blob gas price ${blobGasPrice} - ${this.errorStr()}`,
            )
          }

          blobGasUsed += BigInt(tx.blobVersionedHashes.length) * blobGasPerBlob

          if (blobGasUsed > blobGasLimit) {
            throw EthereumJSErrorWithoutCode(
              `tx causes total blob gas of ${blobGasUsed} to exceed maximum blob gas per block of ${blobGasLimit}`,
            )
          }
        }
      }

      if (this.header.blobGasUsed !== blobGasUsed) {
        throw EthereumJSErrorWithoutCode(
          `block blobGasUsed mismatch: have ${this.header.blobGasUsed}, want ${blobGasUsed}`,
        )
      }
    }
  }

  uncleHashIsValid(): boolean {
    if (this.uncleHeaders.length === 0) {
      return equalsBytes(KECCAK256_RLP_ARRAY, this.header.uncleHash)
    }
    const uncles = this.uncleHeaders.map((uh) => uh.raw())
    const raw = RLP.encode(uncles)
    return equalsBytes(this.keccakFunction(raw), this.header.uncleHash)
  }

  async withdrawalsTrieIsValid(): Promise<boolean> {
    if (!this.isEIPActive(4895)) {
      throw EthereumJSErrorWithoutCode('EIP 4895 is not activated')
    }

    let result
    if (this.withdrawals!.length === 0) {
      result = equalsBytes(this.header.withdrawalsRoot!, KECCAK256_RLP)
      return result
    }

    if (this.cache.withdrawalsTrieRoot === undefined) {
      this.cache.withdrawalsTrieRoot = await genWithdrawalsTrieRoot(
        this.withdrawals!,
        new MerklePatriciaTrie(),
      )
    }
    result = equalsBytes(
      this.cache.withdrawalsTrieRoot,
      this.header.withdrawalsRoot!,
    )
    return result
  }

  validateUncles() {
    if (this.isGenesis()) {
      return
    }
    validateUncleHeaders(this.uncleHeaders)
  }

  validateGasLimit(parentBlock: Block) {
    return this.header.validateGasLimit(parentBlock.header)
  }

  toJSON(): JSONBlock {
    const withdrawalsAttr = this.withdrawals
      ? {
          withdrawals: this.withdrawals.map((wt) => wt.toJSON()),
        }
      : {}
    return {
      header: this.header.toJSON(),
      transactions: this.transactions.map((tx) => tx.toJSON()),
      uncleHeaders: this.uncleHeaders.map((uh) => uh.toJSON()),
      ...withdrawalsAttr,
    }
  }

  toExecutionPayload(): ExecutionPayload {
    const blockJSON = this.toJSON()
    const header = blockJSON.header!
    const transactions =
      this.transactions.map((tx) => bytesToHex(tx.serialize())) ?? []
    const withdrawalsArr = blockJSON.withdrawals
      ? { withdrawals: blockJSON.withdrawals }
      : {}

    const executionPayload: ExecutionPayload = {
      blockNumber: header.number!,
      parentHash: header.parentHash!,
      feeRecipient: header.coinbase!,
      stateRoot: header.stateRoot!,
      receiptsRoot: header.receiptTrie!,
      logsBloom: header.logsBloom!,
      gasLimit: header.gasLimit!,
      gasUsed: header.gasUsed!,
      timestamp: header.timestamp!,
      extraData: header.extraData!,
      baseFeePerGas: header.baseFeePerGas!,
      blobGasUsed: header.blobGasUsed,
      excessBlobGas: header.excessBlobGas,
      blockHash: bytesToHex(this.hash()),
      prevRandao: header.mixHash!,
      transactions,
      ...withdrawalsArr,
      parentBeaconBlockRoot: header.parentBeaconBlockRoot,
      requestsHash: header.requestsHash,
    }

    return executionPayload
  }

  public errorStr() {
    let hash = ''
    try {
      hash = bytesToHex(this.hash())
    } catch {
      hash = 'error'
    }
    let hf = ''
    try {
      hf = this.hardfork
    } catch {
      hf = 'error'
    }
    let errorStr = `block number=${this.header.number} hash=${hash} `
    errorStr += `hf=${hf} baseFeePerGas=${this.header.baseFeePerGas ?? 'none'} `
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
