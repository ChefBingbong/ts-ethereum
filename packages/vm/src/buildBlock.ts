import { sha256 } from '@noble/hashes/sha2.js'
import type { Block, HeaderData } from '@ts-ethereum/block'
import {
  createBlock,
  createBlockContext,
  createSealedCliqueBlock,
  genRequestsRoot,
  genTransactionsTrieRoot,
  genWithdrawalsTrieRoot,
} from '@ts-ethereum/block'
import { ConsensusType, Hardfork } from '@ts-ethereum/chain-config'
import { createEVM, type EVM, type EVMInterface } from '@ts-ethereum/evm'
import { MerklePatriciaTrie } from '@ts-ethereum/mpt'
import { RLP } from '@ts-ethereum/rlp'
import type { TypedTransaction } from '@ts-ethereum/tx'
import {
  Blob4844Tx,
  createMinimal4844TxFromNetworkWrapper,
  NetworkWrapperType,
} from '@ts-ethereum/tx'
import type { Withdrawal } from '@ts-ethereum/utils'
import {
  Address,
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  createWithdrawal,
  createZeroAddress,
  EthereumJSErrorWithoutCode,
  GWEI_TO_WEI,
  KECCAK256_RLP,
  TypeOutput,
  toBytes,
  toType,
} from '@ts-ethereum/utils'
import { Bloom } from './bloom/index'
import { runTx } from './index'
import { accumulateRequests } from './requests'
import {
  _applyDAOHardfork,
  accumulateParentBeaconBlockRoot,
  accumulateParentBlockHash,
  calculateMinerReward,
  encodeReceipt,
  rewardAccount,
} from './runBlock'
import type {
  BuildBlockOpts,
  BuilderOpts,
  RunTxResult,
  SealBlockOpts,
} from './types'
import type { VM } from './vm'

export type BuildStatus = (typeof BuildStatus)[keyof typeof BuildStatus]
export const BuildStatus = {
  Reverted: 'reverted',
  Build: 'build',
  Pending: 'pending',
} as const

type BlockStatus =
  | { status: typeof BuildStatus.Pending | typeof BuildStatus.Reverted }
  | { status: typeof BuildStatus.Build; block: Block }

export class BlockBuilder {
  /**
   * The cumulative gas used by the transactions added to the block.
   */
  gasUsed = BIGINT_0
  /**
   *  The cumulative blob gas used by the blobs in a block
   */
  blobGasUsed = BIGINT_0
  /**
   * Value of the block, represented by the final transaction fees
   * accruing to the miner.
   */
  private _minerValue = BIGINT_0

  private readonly vm: VM
  private blockOpts: BuilderOpts
  private headerData: HeaderData
  private transactions: TypedTransaction[] = []
  private transactionResults: RunTxResult[] = []
  private withdrawals?: Withdrawal[]
  private checkpointed = false
  private blockStatus: BlockStatus = { status: BuildStatus.Pending }
  private blockEvm: EVMInterface | undefined
  private blockHardfork: string

  get transactionReceipts() {
    return this.transactionResults.map((result) => result.receipt)
  }

  get minerValue() {
    return this._minerValue
  }

  constructor(vm: VM, opts: BuildBlockOpts) {
    this.vm = vm
    // Determine hardfork for this block being built
    this.blockHardfork = vm.hardforkManager.getHardforkByBlock(
      toType(
        opts.headerData?.number ?? opts.parentBlock.header.number + BIGINT_1,
        TypeOutput.BigInt,
      ),
      toType(
        opts.headerData?.timestamp ?? Math.round(Date.now() / 1000),
        TypeOutput.BigInt,
      ),
    )

    this.blockOpts = {
      putBlockIntoBlockchain: true,
      ...opts.blockOpts,
      hardforkManager: this.vm.hardforkManager,
    }

    this.headerData = {
      ...opts.headerData,
      parentHash: opts.headerData?.parentHash ?? opts.parentBlock.hash(),
      number:
        opts.headerData?.number ?? opts.parentBlock.header.number + BIGINT_1,
      gasLimit: opts.headerData?.gasLimit ?? opts.parentBlock.header.gasLimit,
      timestamp: opts.headerData?.timestamp ?? Math.round(Date.now() / 1000),
    }
    this.withdrawals = opts.withdrawals?.map(createWithdrawal)

    console.log(this.headerData.baseFeePerGas, 'baseFeePerGas', this.headerData)
    if (
      this.vm.hardforkManager.isEIPActiveAtHardfork(1559, this.blockHardfork) &&
      typeof this.headerData.baseFeePerGas === 'undefined'
    ) {
      const londonBlock = vm.hardforkManager.hardforkBlock(Hardfork.London)
      if (londonBlock !== null && this.headerData.number === londonBlock) {
        this.headerData.baseFeePerGas = BigInt(
          vm.hardforkManager.getParamAtHardfork(
            'initialBaseFee',
            this.blockHardfork,
          )!,
        )
      } else {
        this.headerData.baseFeePerGas =
          opts.parentBlock.header.calcNextBaseFee()
      }
    }

    if (typeof this.headerData.gasLimit === 'undefined') {
      const londonBlock = vm.hardforkManager.hardforkBlock(Hardfork.London)
      if (londonBlock !== null && this.headerData.number === londonBlock) {
        this.headerData.gasLimit = opts.parentBlock.header.gasLimit * BIGINT_2
      } else {
        this.headerData.gasLimit = opts.parentBlock.header.gasLimit
      }
    }

    if (
      this.vm.hardforkManager.isEIPActiveAtHardfork(4844, this.blockHardfork) &&
      typeof this.headerData.excessBlobGas === 'undefined'
    ) {
      this.headerData.excessBlobGas =
        opts.parentBlock.header.calcNextExcessBlobGas(
          // this.vm.hardforkManager,
          this.blockHardfork,
        )
    }
  }

  /**
   * Throws if the block has already been built or reverted.
   */
  private checkStatus() {
    if (this.blockStatus.status === BuildStatus.Build) {
      throw EthereumJSErrorWithoutCode('Block has already been built')
    }
    if (this.blockStatus.status === BuildStatus.Reverted) {
      throw EthereumJSErrorWithoutCode('State has already been reverted')
    }
  }

  /**
   * Gets or creates the block-scoped EVM instance.
   * Creates a fresh EVM on first access, ensuring opcodes and precompiles
   * are correctly configured for this block's hardfork.
   */
  private async getBlockEvm(): Promise<EVMInterface> {
    if (this.blockEvm === undefined) {
      const vmEvmOpts = (this.vm.evm as EVM)['_optsCached']
      this.blockEvm = await createEVM({
        common: this.vm.hardforkManager,
        hardfork: this.blockHardfork, // Lock to this block's hardfork
        stateManager: this.vm.stateManager,
        blockchain: this.vm.blockchain,
        // Copy relevant options from VM's original EVM
        allowUnlimitedContractSize: vmEvmOpts?.allowUnlimitedContractSize,
        allowUnlimitedInitCodeSize: vmEvmOpts?.allowUnlimitedInitCodeSize,
        customOpcodes: vmEvmOpts?.customOpcodes,
        customPrecompiles: vmEvmOpts?.customPrecompiles,
        customCrypto: vmEvmOpts?.customCrypto,
        profiler: vmEvmOpts?.profiler,
      })
    }
    return this.blockEvm
  }

  public getStatus(): BlockStatus {
    return this.blockStatus
  }

  /**
   * Calculates and returns the transactionsTrie for the block.
   */
  public async transactionsTrie() {
    const blockHardfork = this.vm.hardforkManager.getHardforkByBlock(
      toType(this.headerData.number ?? 0, TypeOutput.BigInt),
      toType(this.headerData.timestamp ?? 0, TypeOutput.BigInt),
    )
    return genTransactionsTrieRoot(
      this.transactions,
      new MerklePatriciaTrie({ common: this.vm.hardforkManager }),
    )
  }

  /**
   * Calculates and returns the logs bloom for the block.
   */
  public logsBloom() {
    const blockHardfork = this.vm.hardforkManager.getHardforkByBlock(
      toType(this.headerData.number ?? 0, TypeOutput.BigInt),
      toType(this.headerData.timestamp ?? 0, TypeOutput.BigInt),
    )
    const bloom = new Bloom(undefined, this.vm.hardforkManager, blockHardfork)
    for (const txResult of this.transactionResults) {
      // Combine blooms via bitwise OR
      bloom.or(txResult.bloom)
    }
    return bloom.bitvector
  }

  /**
   * Calculates and returns the receiptTrie for the block.
   */
  public async receiptTrie() {
    if (this.transactionResults.length === 0) {
      return KECCAK256_RLP
    }
    const receiptTrie = new MerklePatriciaTrie({
      common: this.vm.hardforkManager,
    })
    for (const [i, txResult] of this.transactionResults.entries()) {
      const tx = this.transactions[i]
      const encodedReceipt = encodeReceipt(txResult.receipt, tx.type)
      await receiptTrie.put(RLP.encode(i), encodedReceipt)
    }
    return receiptTrie.root()
  }

  /**
   * Adds the block miner reward to the coinbase account.
   */
  private async rewardMiner() {
    const minerReward = this.vm.hardforkManager.getParamAtHardfork(
      'minerReward',
      this.blockHardfork,
    )!
    const reward = calculateMinerReward(BigInt(minerReward ?? 0), 0)
    const coinbase =
      this.headerData.coinbase !== undefined
        ? new Address(toBytes(this.headerData.coinbase))
        : createZeroAddress()
    const blockEvm = await this.getBlockEvm()
    await rewardAccount(
      blockEvm,
      coinbase,
      reward,
      this.vm.hardforkManager,
      this.blockHardfork,
    )
  }

  /**
   * Adds the withdrawal amount to the withdrawal address
   */
  private async processWithdrawals() {
    const blockEvm = await this.getBlockEvm()
    for (const withdrawal of this.withdrawals ?? []) {
      const { address, amount } = withdrawal
      // If there is no amount to add, skip touching the account
      // as per the implementation of other clients geth/nethermind
      // although this should never happen as no withdrawals with 0
      // amount should ever land up here.
      if (amount === BIGINT_0) continue
      // Withdrawal amount is represented in Gwei so needs to be
      // converted to wei
      await rewardAccount(
        blockEvm,
        address,
        amount * GWEI_TO_WEI,
        this.vm.hardforkManager,
        this.blockHardfork,
      )
    }
  }

  /**
   * Run and add a transaction to the block being built.
   * Please note that this modifies the state of the VM.
   * Throws if the transaction's gasLimit is greater than
   * the remaining gas in the block.
   */
  async addTransaction(
    tx: TypedTransaction,
    {
      skipHardForkValidation,
      allowNoBlobs,
    }: { skipHardForkValidation?: boolean; allowNoBlobs?: boolean } = {},
  ) {
    this.checkStatus()

    const blockEvm = await this.getBlockEvm()
    if (!this.checkpointed) {
      await blockEvm.journal.checkpoint()
      this.checkpointed = true
    }

    // According to the Yellow Paper, a transaction's gas limit
    // cannot be greater than the remaining gas in the block
    let blobGasUsed
    let blobGasPerBlob
    if (
      this.vm.hardforkManager.isEIPActiveAtHardfork(4844, this.blockHardfork)
    ) {
      const blockGasLimit = toType(this.headerData.gasLimit, TypeOutput.BigInt)
      const _blobGasPerBlob = this.vm.hardforkManager.getParamAtHardfork(
        'blobGasPerBlob',
        this.blockHardfork,
      )!

      const blockGasRemaining = blockGasLimit - this.gasUsed
      if (tx.gasLimit > blockGasRemaining) {
        throw EthereumJSErrorWithoutCode(
          'tx has a higher gas limit than the remaining gas in the block',
        )
      }
      if (tx instanceof Blob4844Tx) {
        const blobGasLimit = this.vm.hardforkManager.getParamAtHardfork(
          'maxBlobGasPerBlock',
          this.blockHardfork,
        )!
        if (
          tx.networkWrapperVersion === NetworkWrapperType.EIP4844 &&
          this.vm.hardforkManager.isEIPActiveAtHardfork(
            7594,
            this.blockHardfork,
          )
        ) {
          throw Error('eip4844 blob transaction for eip7594 activated fork')
        } else if (
          tx.networkWrapperVersion === NetworkWrapperType.EIP7594 &&
          !this.vm.hardforkManager.isEIPActiveAtHardfork(
            7594,
            this.blockHardfork,
          )
        ) {
          throw Error('eip7594 blob transaction but eip not yet activated')
        }

        if (
          !this.vm.hardforkManager.isEIPActiveAtHardfork(
            4844,
            this.blockHardfork,
          )
        ) {
          throw Error('eip4844 not activated yet for adding a blob transaction')
        }
        const blobTx = tx as Blob4844Tx

        // Guard against the case if a tx came into the pool without blobs i.e. network wrapper payload
        if (blobTx.blobs === undefined) {
          // TODO: verify if we want this, do we want to allow the block builder to accept blob txs without the actual blobs?
          // (these must have at least one `blobVersionedHashes`, this is verified at tx-level)
          if (allowNoBlobs !== true) {
            throw EthereumJSErrorWithoutCode(
              'blobs missing for 4844 transaction',
            )
          }
        }

        if (
          this.blobGasUsed + BigInt(blobTx.numBlobs()) * _blobGasPerBlob >
          blobGasLimit
        ) {
          throw EthereumJSErrorWithoutCode('block blob gas limit reached')
        }

        blobGasUsed = this.blobGasUsed
        blobGasPerBlob = _blobGasPerBlob
      }
    }
    const header = {
      ...this.headerData,
      gasUsed: this.gasUsed,
      blobGasUsed,
    }

    const blockData = { header, transactions: this.transactions }
    const block = createBlock(blockData, this.blockOpts)

    // Create BlockContext to ensure consistent execution context
    // This matches what runBlock does in applyTransactions
    const blockContext = createBlockContext(
      block.header,
      this.vm.hardforkManager,
      (blockNumber: bigint) => {
        // For BLOCKHASH opcode, we can only access blocks that are already in the blockchain
        // This is a synchronous operation - if the block isn't available, return undefined
        // The EVM will handle this by returning zero hash
        return undefined // Will be handled by EVM's getBlockHash implementation
      },
    )

    const result = await runTx(this.vm, {
      tx,
      block,
      blockContext,
      skipHardForkValidation,
      blockGasUsed: this.gasUsed,
      evm: blockEvm, // Pass the block-scoped EVM
    })

    // If tx is a blob transaction, remove blobs/kzg commitments before adding to block per EIP-4844
    if (tx instanceof Blob4844Tx && blobGasPerBlob !== undefined) {
      const txData = tx as Blob4844Tx
      this.blobGasUsed +=
        BigInt(txData.blobVersionedHashes.length) * blobGasPerBlob
      tx = createMinimal4844TxFromNetworkWrapper(txData, {
        common: this.blockOpts.hardforkManager,
      })
    }
    this.transactions.push(tx)
    this.transactionResults.push(result)
    this.gasUsed += result.totalGasSpent
    this._minerValue += result.minerValue

    return result
  }

  /**
   * Reverts the checkpoint on the StateManager to reset the state from any transactions that have been run.
   */
  async revert() {
    if (this.checkpointed && this.blockEvm !== undefined) {
      await this.blockEvm.journal.revert()
      this.checkpointed = false
    }
    this.blockStatus = { status: BuildStatus.Reverted }
  }

  /**
   * This method constructs the finalized block, including withdrawals and any CLRequests.
   * It also:
   *  - Assigns the reward for miner (PoW)
   *  - Commits the checkpoint on the StateManager
   *  - Sets the tip of the VM's blockchain to this block
   * For PoW, optionally seals the block with params `nonce` and `mixHash`,
   * which is validated along with the block number and difficulty by ethash.
   * For PoA, please pass `blockOption.cliqueSigner` into the buildBlock constructor,
   * as the signer will be awarded the txs amount spent on gas as they are added.
   *
   * Note: we add CLRequests here because they can be generated at any time during the
   * lifecycle of a pending block so need to be provided only when the block is finalized.
   */
  async build(sealOpts?: SealBlockOpts) {
    this.checkStatus()
    const blockOpts = this.blockOpts
    const blockHardfork = this.vm.hardforkManager.getHardforkByBlock(
      toType(this.headerData.number ?? 0, TypeOutput.BigInt),
      toType(this.headerData.timestamp ?? 0, TypeOutput.BigInt),
    )
    const consensusType =
      this.vm.hardforkManager.config.spec.chain.consensus.type

    if (consensusType === ConsensusType.ProofOfWork) {
      await this.rewardMiner()
    }
    await this.processWithdrawals()

    const transactionsTrie = await this.transactionsTrie()
    const withdrawalsRoot = this.withdrawals
      ? await genWithdrawalsTrieRoot(
          this.withdrawals,
          new MerklePatriciaTrie({ common: this.vm.hardforkManager }),
        )
      : undefined
    const receiptTrie = await this.receiptTrie()
    const logsBloom = this.logsBloom()
    const gasUsed = this.gasUsed
    // timestamp should already be set in constructor
    const timestamp = this.headerData.timestamp ?? BIGINT_0

    let blobGasUsed
    if (this.vm.hardforkManager.isEIPActiveAtHardfork(4844, blockHardfork)) {
      blobGasUsed = this.blobGasUsed
    }

    let requests
    let requestsHash
    if (this.vm.hardforkManager.isEIPActiveAtHardfork(7685, blockHardfork)) {
      // Note: HardforkManager doesn't expose customCrypto, use default sha256
      const sha256Function = sha256
      requests = await accumulateRequests(
        this.vm,
        this.transactionResults,
        blockHardfork,
      )
      requestsHash = genRequestsRoot(requests, sha256Function)
    }

    // Commit checkpoint before getting stateRoot to ensure all state changes are persisted
    // This matches the order in runBlock() where commit happens before getStateRoot()
    if (this.checkpointed && this.blockEvm !== undefined) {
      await this.blockEvm.journal.commit()
      this.checkpointed = false
    }

    // get stateRoot after all operations including commit are done
    const stateRoot = await this.vm.stateManager.getStateRoot()
    const headerData = {
      ...this.headerData,
      stateRoot,
      transactionsTrie,
      withdrawalsRoot,
      receiptTrie,
      logsBloom,
      gasUsed,
      timestamp,
      // correct excessBlobGas should already be part of headerData used above
      blobGasUsed,
      requestsHash,
    }

    if (consensusType === ConsensusType.ProofOfWork) {
      headerData.nonce = sealOpts?.nonce ?? headerData.nonce
      headerData.mixHash = sealOpts?.mixHash ?? headerData.mixHash
    }

    const blockData = {
      header: headerData,
      transactions: this.transactions,
      withdrawals: this.withdrawals,
    }

    let block
    const cs = this.blockOpts.cliqueSigner
    if (cs !== undefined) {
      block = createSealedCliqueBlock(cs, blockData, this.blockOpts)
    } else {
      block = createBlock(blockData, blockOpts)
    }

    if (this.blockOpts.putBlockIntoBlockchain === true) {
      await this.vm.blockchain.putBlock(block)
    }

    this.blockStatus = { status: BuildStatus.Build, block }
    // Note: checkpoint is already committed above before getting stateRoot
    // This ensures the stateRoot in the block header matches what runBlock() will produce

    return { block, requests }
  }

  async initState() {
    const blockEvm = await this.getBlockEvm()
    const blockHardfork = this.blockHardfork

    // Apply DAO hardfork if this is the DAO fork block
    const daoHardforkBlock = this.vm.hardforkManager.hardforkBlock(Hardfork.Dao)
    if (
      daoHardforkBlock !== null &&
      this.headerData.number !== undefined &&
      toType(this.headerData.number, TypeOutput.BigInt) >= daoHardforkBlock &&
      toType(this.headerData.number, TypeOutput.BigInt) === daoHardforkBlock
    ) {
      if (!this.checkpointed) {
        await blockEvm.journal.checkpoint()
        this.checkpointed = true
      }
      await _applyDAOHardfork(blockEvm)
      await blockEvm.journal.commit()
      // Reset checkpointed flag after committing DAO hardfork
      // The DAO hardfork changes are now persisted, and we'll create a new checkpoint
      // for the block building process if needed
      this.checkpointed = false
    }

    if (this.vm.hardforkManager.isEIPActiveAtHardfork(4788, blockHardfork)) {
      if (!this.checkpointed) {
        await blockEvm.journal.checkpoint()
        this.checkpointed = true
      }

      const { parentBeaconBlockRoot, timestamp } = this.headerData
      // timestamp should already be set in constructor
      const timestampBigInt = toType(timestamp ?? 0, TypeOutput.BigInt)
      const parentBeaconBlockRootBuf =
        toType(parentBeaconBlockRoot!, TypeOutput.Uint8Array) ??
        new Uint8Array(32)

      await accumulateParentBeaconBlockRoot(
        this.vm,
        parentBeaconBlockRootBuf,
        timestampBigInt,
        blockHardfork,
        blockEvm,
      )
    }
    if (this.vm.hardforkManager.isEIPActiveAtHardfork(2935, blockHardfork)) {
      if (!this.checkpointed) {
        await blockEvm.journal.checkpoint()
        this.checkpointed = true
      }

      const { parentHash, number } = this.headerData
      // timestamp should already be set in constructor
      const numberBigInt = toType(number ?? 0, TypeOutput.BigInt)
      const parentHashSanitized =
        toType(parentHash, TypeOutput.Uint8Array) ?? new Uint8Array(32)

      await accumulateParentBlockHash(
        this.vm,
        numberBigInt,
        parentHashSanitized,
        blockHardfork,
        blockEvm,
      )
    }
  }
}

/**
 * Build a block on top of the current state
 * by adding one transaction at a time.
 *
 * Creates a checkpoint on the StateManager and modifies the state
 * as transactions are run. The checkpoint is committed on {@link BlockBuilder.build}
 * or discarded with {@link BlockBuilder.revert}.
 *
 * @param {VM} vm
 * @param {BuildBlockOpts} opts
 * @returns An instance of {@link BlockBuilder} with methods:
 * - {@link BlockBuilder.addTransaction}
 * - {@link BlockBuilder.build}
 * - {@link BlockBuilder.revert}
 */
export async function buildBlock(
  vm: VM,
  opts: BuildBlockOpts,
): Promise<BlockBuilder> {
  const blockBuilder = new BlockBuilder(vm, opts)
  await blockBuilder.initState()
  return blockBuilder
}
