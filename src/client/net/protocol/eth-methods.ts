import type { BlockBodyBytes, BlockHeader } from "../../../block";
import type { TypedTransaction } from "../../../tx";
import type { TxReceipt } from "../../../vm";

type GetBlockHeadersOpts = {
	/* Request id (default: next internal id) */
	reqId?: bigint;
	/* The block's number or hash */
	block: bigint | Uint8Array;
	/* Max number of blocks to return */
	max: number;
	/* Number of blocks to skip apart (default: 0) */
	skip?: number;
	/* Fetch blocks in reverse (default: false) */
	reverse?: boolean;
};

type GetBlockBodiesOpts = {
	/* Request id (default: next internal id) */
	reqId?: bigint;
	/* The block hashes */
	hashes: Uint8Array[];
};

type GetPooledTransactionsOpts = {
	/* Request id (default: next internal id) */
	reqId?: bigint;
	/* The tx hashes */
	hashes: Uint8Array[];
};

type GetReceiptsOpts = {
	/* Request id (default: next internal id) */
	reqId?: bigint;
	/* The block hashes to request receipts for */
	hashes: Uint8Array[];
};

/*
 * Messages with responses that are added as
 * methods in camelCase to BoundProtocol.
 */
export interface EthProtocolMethods {
	getBlockHeaders: (
		opts: GetBlockHeadersOpts,
	) => Promise<[bigint, BlockHeader[]]>;
	getBlockBodies: (
		opts: GetBlockBodiesOpts,
	) => Promise<[bigint, BlockBodyBytes[]]>;
	getPooledTransactions: (
		opts: GetPooledTransactionsOpts,
	) => Promise<[bigint, TypedTransaction[]]>;
	getReceipts: (opts: GetReceiptsOpts) => Promise<[bigint, TxReceipt[]]>;
	updatedBestHeader?: BlockHeader;
	status?: {
		bestHash: Uint8Array;
		[key: string]: any;
	};
	handleMessageQueue?(): void;
	send?(name: string, args?: unknown): void;
	request?(name: string, args?: unknown): Promise<unknown>;
}

