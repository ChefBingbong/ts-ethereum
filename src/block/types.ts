import type { Common, ParamsDict } from "../chain-config/index.ts";
import type {
	JSONRPCTx,
	JSONTx,
	TransactionType,
	TxData,
} from "../tx/index.ts";
import type {
	AddressLike,
	BigIntLike,
	BytesLike,
	NumericString,
	PrefixedHexString,
} from "../utils/index.ts";
import type { BlockHeader } from "./index.ts";

/**
 * An object to set to which blockchain the blocks and their headers belong. This could be specified
 * using a {@link Common} object, or `chain` and `hardfork`. Defaults to mainnet without specifying a
 * hardfork.
 */
export interface BlockOptions {
	/**
	 * A {@link Common} object defining the chain and the hardfork a block/block header belongs to.
	 *
	 * Object will be internally copied so that tx behavior don't incidentally
	 * change on future HF changes.
	 *
	 * Default: {@link Common} object set to `mainnet` and the HF currently defined as the default
	 * hardfork in the {@link Common} class.
	 *
	 * Current default hardfork: `chainstart`
	 */
	common?: Common;
	/**
	 * Block parameters sorted by EIP can be found in the exported `paramsBlock` dictionary,
	 * which is internally passed to the associated `@ethereumjs/common` instance which
	 * manages parameter selection based on the hardfork and EIP settings.
	 *
	 * This option allows providing a custom set of parameters. Note that parameters
	 * get fully overwritten, so you need to extend the default parameter dict
	 * to provide the full parameter set.
	 *
	 * It is recommended to deep-clone the params object for this to avoid side effects:
	 *
	 * ```ts
	 * const params = JSON.parse(JSON.stringify(paramsBlock))
	 * params['1']['minGasLimit'] = 3000 // 5000
	 * ```
	 */
	params?: ParamsDict;
	/**
	 * If a preceding {@link BlockHeader} (usually the parent header) is given the preceding
	 * header will be used to calculate the difficulty for this block and the calculated
	 * difficulty takes precedence over a provided static `difficulty` value.
	 *
	 * Note that this option has no effect on networks other than PoW/Ethash networks.
	 */
	calcDifficultyFromHeader?: BlockHeader;
	/**
	 * A block object by default gets frozen along initialization. This gives you
	 * strong additional security guarantees on the consistency of the block parameters.
	 * It also enables block hash caching when the `hash()` method is called multiple times.
	 *
	 * If you need to deactivate the block freeze - e.g. because you want to subclass block and
	 * add additional properties - it is strongly encouraged that you do the freeze yourself
	 * within your code instead.
	 *
	 * Default: true
	 */
	freeze?: boolean;
	/**
	 *  Skip consensus format validation checks on header if set. Defaults to false.
	 */
	skipConsensusFormatValidation?: boolean;
}

/**
 * A block header's data (Frontier/Chainstart format).
 */
export interface HeaderData {
	parentHash?: BytesLike;
	uncleHash?: BytesLike;
	coinbase?: AddressLike;
	stateRoot?: BytesLike;
	transactionsTrie?: BytesLike;
	receiptTrie?: BytesLike;
	logsBloom?: BytesLike;
	difficulty?: BigIntLike;
	number?: BigIntLike;
	gasLimit?: BigIntLike;
	gasUsed?: BigIntLike;
	timestamp?: BigIntLike;
	extraData?: BytesLike;
	mixHash?: BytesLike;
	nonce?: BytesLike;
}

/**
 * A block's data.
 */
export interface BlockData {
	/**
	 * Header data for the block
	 */
	header?: HeaderData;
	transactions?: Array<TxData[TransactionType]>;
	uncleHeaders?: Array<HeaderData>;
}

export type BlockBytes = [
	BlockHeaderBytes,
	TransactionsBytes,
	UncleHeadersBytes,
];

export type BlockHeaderBytes = Uint8Array[];
export type BlockBodyBytes = [TransactionsBytes, UncleHeadersBytes];
/**
 * TransactionsBytes can be an array of serialized txs for Typed Transactions or an array of Uint8Array Arrays for legacy transactions.
 * For Frontier, all transactions are legacy.
 */
export type TransactionsBytes = Uint8Array[][] | Uint8Array[];
export type UncleHeadersBytes = Uint8Array[][];

/**
 * An object with the block's data represented as strings.
 */
export interface JSONBlock {
	/**
	 * Header data for the block
	 */
	header?: JSONHeader;
	transactions?: JSONTx[];
	uncleHeaders?: JSONHeader[];
}

/**
 * An object with the block header's data represented as 0x-prefixed hex strings.
 */
export interface JSONHeader {
	parentHash?: PrefixedHexString;
	uncleHash?: PrefixedHexString;
	coinbase?: PrefixedHexString;
	stateRoot?: PrefixedHexString;
	transactionsTrie?: PrefixedHexString;
	receiptTrie?: PrefixedHexString;
	logsBloom?: PrefixedHexString;
	difficulty?: PrefixedHexString;
	number?: PrefixedHexString;
	gasLimit?: PrefixedHexString;
	gasUsed?: PrefixedHexString;
	timestamp?: PrefixedHexString;
	extraData?: PrefixedHexString;
	mixHash?: PrefixedHexString;
	nonce?: PrefixedHexString;
}

/*
 * Based on https://ethereum.org/en/developers/docs/apis/json-rpc/
 */
export interface JSONRPCBlock {
	number: PrefixedHexString; // the block number.
	hash: PrefixedHexString; // hash of the block.
	parentHash: PrefixedHexString; // hash of the parent block.
	mixHash?: PrefixedHexString; // bit hash which proves combined with the nonce that a sufficient amount of computation has been carried out on this block.
	nonce: PrefixedHexString; // hash of the generated proof-of-work.
	sha3Uncles: PrefixedHexString; // SHA3 of the uncles data in the block.
	logsBloom: PrefixedHexString; // the bloom filter for the logs of the block.
	transactionsRoot: PrefixedHexString; // the root of the transaction trie of the block.
	stateRoot: PrefixedHexString; // the root of the final state trie of the block.
	receiptsRoot: PrefixedHexString; // the root of the receipts trie of the block.
	miner: PrefixedHexString; // the address of the beneficiary to whom the mining rewards were given.
	difficulty: PrefixedHexString | NumericString; // integer of the difficulty for this block. Can be a 0x-prefixed hex string or a string integer
	totalDifficulty?: PrefixedHexString; // integer of the total difficulty of the chain until this block.
	extraData: PrefixedHexString; // the "extra data" field of this block.
	size: PrefixedHexString; // integer the size of this block in bytes.
	gasLimit: PrefixedHexString; // the maximum gas allowed in this block.
	gasUsed: PrefixedHexString; // the total used gas by all transactions in this block.
	timestamp: PrefixedHexString; // the unix timestamp for when the block was collated.
	transactions: Array<JSONRPCTx | PrefixedHexString>; // Array of transaction objects, or 32 Bytes transaction hashes depending on the last given parameter.
	uncles: PrefixedHexString[]; // Array of uncle hashes
}
