import type { Block, HeaderData } from '@ts-ethereum/block'
import { TypedTransaction } from '@ts-ethereum/tx'
import {
  BIGINT_1,
  bigIntToUnpaddedBytes,
  bytesToHex,
  concatBytes,
  equalsBytes,
  toType,
  TypeOutput,
} from '@ts-ethereum/utils'
import {
  BlockBuilder,
  buildBlock,
  BuildStatus,
  TxReceipt,
  VM,
} from '@ts-ethereum/vm'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import type { Config } from '../config/index'
import type { TxPool } from '../service/txpool'

interface PendingBlockOpts {
  /* Config */
  config: Config

  /* Tx Pool */
  txPool: TxPool

  /* Skip hardfork validation */
  skipHardForkValidation?: boolean
}

/**
 * In the future this class should build a pending block by keeping the
 * transaction set up-to-date with the state of local mempool until called.
 *
 * For now this simple implementation just adds txs from the pool when
 * started and called.
 */

// Max two payload to be cached
const MAX_PAYLOAD_CACHE = 2

type AddTxResult = (typeof AddTxResult)[keyof typeof AddTxResult]

const AddTxResult = {
  Success: 'Success',
  BlockFull: 'BlockFull',
  SkippedByGasLimit: 'SkippedByGasLimit',
  SkippedByErrors: 'SkippedByErrors',
  RemovedByErrors: 'RemovedByErrors',
} as const

export class PendingBlock {
  config: Config
  txPool: TxPool

  pendingPayloads: Map<string, BlockBuilder> = new Map()

  private skipHardForkValidation?: boolean

  constructor(opts: PendingBlockOpts) {
    this.config = opts.config
    this.txPool = opts.txPool
    this.skipHardForkValidation = opts.skipHardForkValidation
  }

  pruneSetToMax(maxItems: number): number {
    let itemsToDelete = this.pendingPayloads.size - maxItems
    const deletedItems = Math.max(0, itemsToDelete)

    if (itemsToDelete > 0) {
      // keys are in fifo order
      for (const payloadId of this.pendingPayloads.keys()) {
        this.stop(payloadId)
        itemsToDelete--
        if (itemsToDelete <= 0) {
          break
        }
      }
    }
    return deletedItems
  }

  /**
   * Starts building a pending block with the given payload
   * @returns an 8-byte payload identifier to call {@link BlockBuilder.build} with
   */
  async start(
    vm: VM,
    parentBlock: Block,
    headerData: Partial<HeaderData> = {},
  ) {
    const number = parentBlock.header.number + BIGINT_1
    const { timestamp, mixHash, coinbase } = headerData
    const { gasLimit } = parentBlock.header

    // payload is uniquely defined by timestamp, parent and mixHash, gasLimit can also be
    // potentially included in the fcU in future and can be safely added in uniqueness calc
    const timestampBuf = bigIntToUnpaddedBytes(
      toType(timestamp ?? 0, TypeOutput.BigInt),
    )
    const gasLimitBuf = bigIntToUnpaddedBytes(gasLimit)
    const mixHashBuf =
      toType(mixHash!, TypeOutput.Uint8Array) ?? new Uint8Array(32)
    const coinbaseBuf = toType(
      coinbase ?? new Uint8Array(20),
      TypeOutput.Uint8Array,
    )

    const keccakFunction = keccak256

    const payloadIdBytes = keccakFunction(
      concatBytes(
        parentBlock.hash(),
        mixHashBuf,
        timestampBuf,
        gasLimitBuf,
        coinbaseBuf,
      ),
    ).subarray(0, 8)

    const payloadId = bytesToHex(payloadIdBytes)

    // If payload has already been triggered, then return the payloadid
    if (this.pendingPayloads.get(payloadId) !== undefined) {
      return payloadIdBytes
    }

    // Prune the builders
    this.pruneSetToMax(MAX_PAYLOAD_CACHE)

    // Set the state root to ensure the resulting state
    // is based on the parent block's state
    await vm.stateManager.setStateRoot(parentBlock.header.stateRoot)

    const builder = await buildBlock(vm, {
      parentBlock,
      headerData: {
        ...headerData,
        number,
        gasLimit,
      },
      blockOpts: {
        putBlockIntoBlockchain: false,
      },
    })

    this.pendingPayloads.set(payloadId, builder)

    // Add current txs in pool
    const txs = await this.txPool.txsByPriceAndNonce(vm, {})
    this.config.options.logger?.info(
      `Pending: Assembling block from ${txs.length} eligible txs`,
    )

    const { addedTxs, skippedByAddErrors } = await this.addTransactions(
      builder,
      txs,
    )
    this.config.options.logger?.info(
      `Pending: Added txs=${addedTxs} skippedByAddErrors=${skippedByAddErrors} from total=${txs.length} tx candidates`,
    )

    return payloadIdBytes
  }

  /**
   * Stops a pending payload
   */
  stop(payloadIdBytes: Uint8Array | string) {
    const payloadId =
      typeof payloadIdBytes !== 'string'
        ? bytesToHex(payloadIdBytes)
        : payloadIdBytes
    const builder = this.pendingPayloads.get(payloadId)
    if (builder === undefined) return
    // Revert blockBuilder
    void builder.revert()
    // Remove from pendingPayloads
    this.pendingPayloads.delete(payloadId)
  }

  /**
   * Returns the completed block
   */
  async build(
    payloadIdBytes: Uint8Array | string,
  ): Promise<void | [block: Block, receipts: TxReceipt[], value: bigint]> {
    const payloadId =
      typeof payloadIdBytes !== 'string'
        ? bytesToHex(payloadIdBytes)
        : payloadIdBytes
    const builder = this.pendingPayloads.get(payloadId)
    if (builder === undefined) {
      return
    }
    const blockStatus = builder.getStatus()
    if (blockStatus.status === BuildStatus.Build) {
      return [
        blockStatus.block,
        builder.transactionReceipts,
        builder.minerValue,
      ]
    }
    const { vm, headerData } = builder as unknown as {
      vm: VM
      headerData: HeaderData
    }

    // Add new txs that the pool received
    const txs = (await this.txPool.txsByPriceAndNonce(vm, {})).filter(
      (tx) =>
        (builder as any).transactions.some((t: TypedTransaction) =>
          equalsBytes(t.hash(), tx.hash()),
        ) === false,
    )

    const { skippedByAddErrors } = await this.addTransactions(builder, txs)

    const { block } = await builder.build()

    this.config.options.logger?.info(
      `Pending: Built block number=${block.header.number} txs=${
        block.transactions.length
      } skippedByAddErrors=${skippedByAddErrors} hash=${bytesToHex(
        block.hash(),
      )}`,
    )

    return [block, builder.transactionReceipts, builder.minerValue]
  }

  private async addTransactions(
    builder: BlockBuilder,
    txs: TypedTransaction[],
  ) {
    this.config.options.logger?.info(
      `Pending: Adding ${txs.length} additional eligible txs`,
    )
    let index = 0
    let blockFull = false
    let skippedByAddErrors = 0

    while (index < txs.length && !blockFull) {
      const tx = txs[index]
      const addTxResult = await this.addTransaction(builder, tx)

      switch (addTxResult) {
        case AddTxResult.Success:
          break
        case AddTxResult.BlockFull:
          blockFull = true
          skippedByAddErrors++
          break
        default:
          skippedByAddErrors++
      }
      index++
    }

    return {
      addedTxs: index - skippedByAddErrors,
      skippedByAddErrors,
      totalTxs: txs.length,
    }
  }

  private async addTransaction(builder: BlockBuilder, tx: TypedTransaction) {
    let addTxResult: AddTxResult

    try {
      await builder.addTransaction(tx, {
        skipHardForkValidation: this.skipHardForkValidation,
      })
      addTxResult = AddTxResult.Success
    } catch (error: any) {
      if (
        error.message ===
        'tx has a higher gas limit than the remaining gas in the block'
      ) {
        if (
          builder.gasUsed >
          (builder as any).headerData.gasLimit - BigInt(21000)
        ) {
          // If block has less than 21000 gas remaining, consider it full
          this.config.options.logger?.info(`Pending: Assembled block full`)
          addTxResult = AddTxResult.BlockFull
        } else {
          addTxResult = AddTxResult.SkippedByGasLimit
        }
      } else {
        // If there is an error adding a tx, it will be skipped
        this.config.options.logger?.debug(
          `Pending: Skipping tx ${bytesToHex(
            tx.hash(),
          )}, error encountered when trying to add tx:\n${error}`,
        )
        addTxResult = AddTxResult.SkippedByErrors
      }
    }
    return addTxResult
  }
}
