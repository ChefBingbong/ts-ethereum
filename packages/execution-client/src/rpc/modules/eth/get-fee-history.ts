import { BlockManager } from '@ts-ethereum/block'
import { Hardfork } from '@ts-ethereum/chain-config'
import {
  BIGINT_0,
  BIGINT_1,
  BIGINT_100,
  BIGINT_NEG1,
  bigIntMax,
  bigIntToHex,
  safeError,
  safeResult,
} from '@ts-ethereum/utils'
import { ReceiptsManager } from 'src/execution/receipt'
import type { ExecutionNode } from '../../../node/index'
import { getBlockByOption } from '../../helpers'
import { createRpcMethod } from '../../validation'
import { getFeeHistorySchema } from './schema'

export const getFeeHistory = (node: ExecutionNode) => {
  const chain = node.chain
  return createRpcMethod(
    getFeeHistorySchema,
    async (params: [string | number | bigint, string, [number]?], _c) => {
      const blockCount = BigInt(params[0])
      const [, lastBlockRequested, priorityFeePercentiles] = params

      if (blockCount < 1n || blockCount > 1024n) {
        return safeError(new Error('invalid block count'))
      }

      const { number: lastRequestedBlockNumber } = (
        await getBlockByOption(lastBlockRequested, chain)
      ).header

      const oldestBlockNumber = bigIntMax(
        lastRequestedBlockNumber - blockCount + BIGINT_1,
        BIGINT_0,
      )

      const requestedBlockNumbers = Array.from(
        { length: Number(blockCount) },
        (_, i) => oldestBlockNumber + BigInt(i),
      )

      const requestedBlocks = await Promise.all(
        requestedBlockNumbers.map((n) => getBlockByOption(n.toString(), chain)),
      )

      const [baseFees, gasUsedRatios, baseFeePerBlobGas, blobGasUsedRatio] =
        requestedBlocks.reduce(
          (v, b) => {
            const [
              prevBaseFees,
              prevGasUsedRatios,
              prevBaseFeesPerBlobGas,
              prevBlobGasUsedRatio,
            ] = v
            const { baseFeePerGas, gasUsed, gasLimit, blobGasUsed } = b.header

            let baseFeePerBlobGas = BIGINT_0
            let blobGasUsedRatio = 0
            if (b.header.excessBlobGas !== undefined) {
              baseFeePerBlobGas = b.header.getBlobGasPrice()
              const max = b.hardforkManager.getParamAtHardfork(
                'maxBlobGasPerBlock',
                b.hardfork,
              )
              blobGasUsedRatio = Number(blobGasUsed) / Number(max)
            }

            prevBaseFees.push(baseFeePerGas ?? BIGINT_0)
            prevGasUsedRatios.push(Number(gasUsed) / Number(gasLimit))

            prevBaseFeesPerBlobGas.push(baseFeePerBlobGas)
            prevBlobGasUsedRatio.push(blobGasUsedRatio)

            return [
              prevBaseFees,
              prevGasUsedRatios,
              prevBaseFeesPerBlobGas,
              prevBlobGasUsedRatio,
            ]
          },
          [[], [], [], []] as [bigint[], number[], bigint[], number[]],
        )

      const londonHardforkBlockNumber =
        chain.blockchain.hardforkManager.hardforkBlock(Hardfork.London)!
      const nextBaseFee =
        lastRequestedBlockNumber - londonHardforkBlockNumber >= BIGINT_NEG1
          ? requestedBlocks[requestedBlocks.length - 1].header.calcNextBaseFee()
          : BIGINT_0
      baseFees.push(nextBaseFee)

      if (
        chain.blockchain.hardforkManager.isEIPActiveAtHardfork(
          4844,
          chain.blockchain.hardforkManager.getHardforkFromContext(
            requestedBlocks[requestedBlocks.length - 1].header.hardfork,
          ),
        )
      ) {
        baseFeePerBlobGas.push(
          // use the last blocks common for fee estimation
          requestedBlocks[
            requestedBlocks.length - 1
          ].header.calcNextBlobGasPrice(
            requestedBlocks[requestedBlocks.length - 1].header.hardfork,
          ),
        )
      } else {
        // TODO (?): known bug
        // If the next block is the first block where 4844 is returned, then
        // BIGINT_1 should be pushed, not BIGINT_0
        baseFeePerBlobGas.push(BIGINT_0)
      }

      let rewards: bigint[][] = []

      const receiptsManager = node.execution?.execution.receiptsManager
      if (receiptsManager && priorityFeePercentiles) {
        rewards = await Promise.all(
          requestedBlocks.map((b) =>
            calculateRewards(b, receiptsManager, priorityFeePercentiles),
          ),
        )
      }

      return safeResult({
        baseFeePerGas: baseFees.map(bigIntToHex),
        gasUsedRatio: gasUsedRatios,
        baseFeePerBlobGas: baseFeePerBlobGas.map(bigIntToHex),
        blobGasUsedRatio,
        oldestBlock: bigIntToHex(oldestBlockNumber),
        reward: rewards.map((r) => r.map(bigIntToHex)),
      })
    },
  )
}

async function calculateRewards(
  block: BlockManager,
  receiptsManager: ReceiptsManager,
  priorityFeePercentiles: number[],
) {
  if (priorityFeePercentiles.length === 0) {
    return []
  }
  if (block.transactions.length === 0) {
    return Array.from({ length: priorityFeePercentiles.length }, () => BIGINT_0)
  }

  const blockRewards: bigint[] = []
  const txGasUsed: bigint[] = []
  const baseFee = block.header.baseFeePerGas
  const receipts = await receiptsManager.getReceipts(block.hash())

  if (receipts.length > 0) {
    txGasUsed.push(receipts[0].cumulativeBlockGasUsed)
    for (let i = 1; i < receipts.length; i++) {
      txGasUsed.push(
        receipts[i].cumulativeBlockGasUsed -
          receipts[i - 1].cumulativeBlockGasUsed,
      )
    }
  }

  const txs = block.transactions
  const txsWithGasUsed = txs.map((tx, i) => ({
    txGasUsed: txGasUsed[i],
    // Can assume baseFee exists, since if EIP1559/EIP4844 txs are included, this is a post-EIP-1559 block.
    effectivePriorityFee: tx.getEffectivePriorityFee(baseFee!),
  }))

  // Sort array based upon the effectivePriorityFee
  txsWithGasUsed.sort((a, b) =>
    Number(a.effectivePriorityFee - b.effectivePriorityFee),
  )

  let priorityFeeIndex = 0
  // Loop over all txs ...
  let targetCumulativeGasUsed =
    (block.header.gasUsed * BigInt(priorityFeePercentiles[0])) / BIGINT_100
  let cumulativeGasUsed = BIGINT_0
  for (let txIndex = 0; txIndex < txsWithGasUsed.length; txIndex++) {
    cumulativeGasUsed += txsWithGasUsed[txIndex].txGasUsed
    while (
      cumulativeGasUsed >= targetCumulativeGasUsed &&
      priorityFeeIndex < priorityFeePercentiles.length
    ) {
      /*
              Idea: keep adding the premium fee to the priority fee percentile until we actually get above the threshold
              For instance, take the priority fees [0,1,2,100]
              The gas used in the block is 1.05 million
              The first tx takes 1 million gas with prio fee A, the second the remainder over 0.05M with prio fee B
              Then it is clear that the priority fees should be [A,A,A,B]
              -> So A should be added three times
              Note: in this case A < B so the priority fees were "sorted" by default
            */
      blockRewards.push(txsWithGasUsed[txIndex].effectivePriorityFee)
      priorityFeeIndex++
      if (priorityFeeIndex >= priorityFeePercentiles.length) {
        // prevent out-of-bounds read
        break
      }
      const priorityFeePercentile = priorityFeePercentiles[priorityFeeIndex]
      targetCumulativeGasUsed =
        (block.header.gasUsed * BigInt(priorityFeePercentile)) / BIGINT_100
    }
  }

  return blockRewards
}
