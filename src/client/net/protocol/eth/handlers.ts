import type { Block } from "../../../../block";
import type { TypedTransaction } from "../../../../tx";
import { concatBytes } from "../../../../utils";
import { encodeReceipt } from "../../../../vm";
import type { Chain } from "../../../blockchain";
import type { VMExecution } from "../../../execution";
import type { TxReceiptWithType } from "../../../execution/receipt";
import type { P2PPeerPool } from "../../../net/p2p-peerpool";
import type { Peer } from "../../../net/peer/peer";
import type { TxPool } from "../../../service/txpool";
import { FullSynchronizer } from "../../../sync";

export interface GetBlockHeadersData {
	reqId: bigint;
	block: bigint | Uint8Array;
	max: number;
	skip: number;
	reverse: boolean;
}

export interface GetBlockBodiesData {
	reqId: bigint;
	hashes: Uint8Array[];
}

export interface GetPooledTransactionsData {
	reqId: bigint;
	hashes: Uint8Array[];
}

export type GetReceiptsData = [reqId: bigint, hashes: Uint8Array[]];

export type NewBlockData = [block: Block, td: Uint8Array];

export interface EthHandlerContext {
	chain: Chain;
	txPool: TxPool;
	synchronizer?: FullSynchronizer;
	execution: VMExecution;
	pool: P2PPeerPool;
}

/**
 * Handle GetBlockHeaders request
 */
export async function handleGetBlockHeaders(
	data: GetBlockHeadersData,
	peer: Peer,
	context: EthHandlerContext,
) {
	const { reqId, block, max, skip, reverse } = data;
	const { chain } = context;

	if (typeof block === "bigint") {
		const height = chain.headers.height;
		if (
			(reverse && block > height) ||
			(!reverse && block + BigInt(max * skip) > height)
		) {
			peer.eth?.send("BlockHeaders", { reqId, headers: [] });
			return;
		}
	}

	const headers = await chain.getHeaders(block, max, skip, reverse);
	peer.eth?.send("BlockHeaders", { reqId, headers });
}

/**
 * Handle GetBlockBodies request
 */
export async function handleGetBlockBodies(
	data: GetBlockBodiesData,
	peer: Peer,
	context: EthHandlerContext,
) {
	const { reqId, hashes } = data;
	const { chain } = context;

	const blocks = await Promise.all(hashes.map(chain.getBlock));
	const bodies = blocks.map((block) => block.raw().slice(1));
	peer.eth?.send("BlockBodies", { reqId, bodies });
}

/**
 * Handle NewBlockHashes announcement
 */
export function handleNewBlockHashes(
	data: Array<[Uint8Array, bigint]>,
	context: EthHandlerContext,
) {
	const { synchronizer } = context;
	if (synchronizer instanceof FullSynchronizer) {
		synchronizer.handleNewBlockHashes(data);
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
	const { txPool, pool } = context;
	await txPool.handleAnnouncedTxs(data, peer, pool);
}

/**
 * Handle NewBlock announcement
 */
export async function handleNewBlock(
	data: NewBlockData,
	peer: Peer,
	context: EthHandlerContext,
) {
	const [block] = data;
	const { synchronizer } = context;
	await synchronizer.handleNewBlock(block, peer);
}

/**
 * Handle NewPooledTransactionHashes announcement
 */
export async function handleNewPooledTransactionHashes(
	data: Uint8Array[] | [number[], number[], Uint8Array[]],
	peer: Peer,
	context: EthHandlerContext,
) {
	const { txPool, pool } = context;

	let hashes: Uint8Array[];
	if (Array.isArray(data) && data.length === 3 && Array.isArray(data[0])) {
		hashes = data[2] as Uint8Array[];
	} else {
		hashes = data as Uint8Array[];
	}

	await txPool.handleAnnouncedTxHashes(hashes, peer, pool);
}

/**
 * Handle GetPooledTransactions request
 */
export function handleGetPooledTransactions(
	data: GetPooledTransactionsData,
	peer: Peer,
	context: EthHandlerContext,
): void {
	const { reqId, hashes } = data;
	const { txPool } = context;

	const txs = txPool.getByHash(hashes);
	peer.eth?.send("PooledTransactions", { reqId, txs });
}

/**
 * Handle GetReceipts request
 */
export async function handleGetReceipts(
	data: GetReceiptsData,
	peer: Peer,
	context: EthHandlerContext,
) {
	const [reqId, hashes] = data;
	const { execution } = context;

	const { receiptsManager } = execution;
	if (!receiptsManager) {
		return;
	}

	const receipts: TxReceiptWithType[] = [];
	let receiptsSize = 0;

	for (const hash of hashes) {
		const blockReceipts = await receiptsManager.getReceipts(hash, true, true);
		if (blockReceipts === undefined) continue;

		receipts.push(...blockReceipts);
		const receiptsBytes = concatBytes(
			...receipts.map((r) => encodeReceipt(r, r.txType)),
		);
		receiptsSize += receiptsBytes.byteLength;

		// From spec: The recommended soft limit for Receipts responses is 2 MiB.
		if (receiptsSize >= 2097152) break;
	}

	peer.eth?.send("Receipts", { reqId, receipts });
}
