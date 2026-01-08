import type { Block } from '@ts-ethereum/block'
import type { TransactionType, TypedTransaction } from '@ts-ethereum/tx'
import { concatBytes } from '@ts-ethereum/utils'
import { encodeReceipt, type TxReceipt } from '@ts-ethereum/vm'
import type { Chain } from '../../../blockchain/index'
import type { VMExecution } from '../../../execution/index'
import type { TxReceiptWithType } from '../../../execution/receipt'
import type { TxPool } from '../../../service/txpool'
import { type BeaconSynchronizer, FullSynchronizer } from '../../../sync/index'
import type { NetworkCore } from '../../core/network-core'
import type { Peer } from '../../peer/peer'

export interface GetBlockHeadersData {
  reqId: bigint
  block: bigint | Uint8Array
  max: number
  skip: number
  reverse: boolean
}

export interface GetBlockBodiesData {
  reqId: bigint
  hashes: Uint8Array[]
}

export interface GetPooledTransactionsData {
  reqId: bigint
  hashes: Uint8Array[]
}

export type GetReceiptsData = [reqId: bigint, hashes: Uint8Array[]]

export type NewBlockData = [block: Block, td: Uint8Array]

export interface EthHandlerContext {
  chain: Chain
  txPool: TxPool
  synchronizer?: FullSynchronizer
  beaconSynchronizer?: BeaconSynchronizer
  execution: VMExecution
  networkCore: NetworkCore
}

/**
 * Handle GetBlockHeaders request
 */
export async function handleGetBlockHeaders(
  data: GetBlockHeadersData,
  peer: Peer,
  context: EthHandlerContext,
) {
  const { reqId, block, max, skip, reverse } = data
  const { chain } = context

  if (typeof block === 'bigint') {
    const height = chain.headers.height
    if (
      (reverse && block > height) ||
      (!reverse && block + BigInt(max * skip) > height)
    ) {
      peer.eth?.send('BlockHeaders', { reqId, headers: [] })
      return
    }
  }

  const headers = await chain.getHeaders(block, max, skip, reverse)
  peer.eth?.send('BlockHeaders', { reqId, headers })
}

/**
 * Handle GetBlockBodies request
 */
export async function handleGetBlockBodies(
  data: GetBlockBodiesData,
  peer: Peer,
  context: EthHandlerContext,
) {
  const { reqId, hashes } = data
  const { chain } = context

  const blocks = await Promise.all(hashes.map(chain.getBlock))
  const bodies = blocks.map((block) => block.raw().slice(1))
  peer.eth?.send('BlockBodies', { reqId, bodies })
}

/**
 * Handle NewBlockHashes announcement
 */
export function handleNewBlockHashes(
  data: [Uint8Array, bigint][],
  context: EthHandlerContext,
) {
  const { synchronizer } = context
  if (synchronizer instanceof FullSynchronizer) {
    synchronizer.handleNewBlockHashes(data)
  }
}

/**
 * Handle Transactions announcement
 */
export async function handleTransactions(
  data: TypedTransaction[],
  peer: Peer,
  context: EthHandlerContext,
) {
  const { txPool, networkCore } = context
  await txPool.handleAnnouncedTxs(data, peer, networkCore)
}

/**
 * Handle NewBlock announcement
 */
export async function handleNewBlock(
  data: NewBlockData,
  peer: Peer,
  context: EthHandlerContext,
) {
  const [block] = data
  const { synchronizer } = context
  if (synchronizer instanceof FullSynchronizer) {
    await synchronizer.handleNewBlock(block, peer)
  }
}

/**
 * Handle NewPooledTransactionHashes announcement
 */
export async function handleNewPooledTransactionHashes(
  data: Uint8Array[] | [number[], number[], Uint8Array[]],
  peer: Peer,
  context: EthHandlerContext,
) {
  const { txPool, networkCore } = context

  let hashes: Uint8Array[]
  if (Array.isArray(data) && data.length === 3 && Array.isArray(data[0])) {
    hashes = data[2] as Uint8Array[]
  } else {
    hashes = data as Uint8Array[]
  }

  await txPool.handleAnnouncedTxHashes(hashes, peer, networkCore)
}

/**
 * Handle GetPooledTransactions request
 */
export function handleGetPooledTransactions(
  data: GetPooledTransactionsData,
  peer: Peer,
  context: EthHandlerContext,
): void {
  const { reqId, hashes } = data
  const { txPool } = context

  const txs = txPool.getByHash(hashes)
  peer.eth?.send('PooledTransactions', { reqId, txs })
}

/**
 * Handle GetReceipts request
 */
export async function handleGetReceipts(
  data: GetReceiptsData,
  peer: Peer,
  context: EthHandlerContext,
) {
  const [reqId, hashes] = data
  const { execution } = context

  const { receiptsManager } = execution
  if (!receiptsManager) {
    return
  }

  const receipts: TxReceiptWithType[] = []
  let receiptsSize = 0

  for (const hash of hashes) {
    const blockReceipts = await receiptsManager.getReceipts(hash, true, true)
    if (blockReceipts === undefined) continue

    receipts.push(...blockReceipts)
    const receiptsBytes = concatBytes(
      ...receipts.map((r) =>
        encodeReceipt(
          r as unknown as TxReceipt,
          r.txType as unknown as TransactionType,
        ),
      ),
    )
    receiptsSize += receiptsBytes.byteLength

    // From spec: The recommended soft limit for Receipts responses is 2 MiB.
    if (receiptsSize >= 2097152) break
  }

  peer.eth?.send('Receipts', { reqId, receipts })
}
