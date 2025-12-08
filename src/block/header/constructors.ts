import * as RLP from "../../rlp/index.ts";
import { EthereumJSErrorWithoutCode } from "../../utils/index.ts";

import { numberToHex, valuesArrayToHeaderData } from "../helpers.ts";
import { BlockHeader } from "../index.ts";

import type {
	BlockHeaderBytes,
	BlockOptions,
	HeaderData,
	JSONRPCBlock,
} from "../types.ts";

/**
 * Static constructor to create a block header from a header data dictionary
 *
 * @param headerData
 * @param opts
 */
export function createBlockHeader(
	headerData: HeaderData = {},
	opts: BlockOptions = {},
) {
	return new BlockHeader(headerData, opts);
}

/**
 * Static constructor to create a block header from an array of bytes values
 *
 * @param values
 * @param opts
 */
export function createBlockHeaderFromBytesArray(
	values: BlockHeaderBytes,
	opts: BlockOptions = {},
) {
	const headerData = valuesArrayToHeaderData(values);
	return createBlockHeader(headerData, opts);
}

/**
 * Static constructor to create a block header from a RLP-serialized header
 *
 * @param serializedHeaderData
 * @param opts
 */
export function createBlockHeaderFromRLP(
	serializedHeaderData: Uint8Array,
	opts: BlockOptions = {},
) {
	const values = RLP.decode(serializedHeaderData);
	if (!Array.isArray(values)) {
		throw EthereumJSErrorWithoutCode(
			"Invalid serialized header input. Must be array",
		);
	}
	return createBlockHeaderFromBytesArray(values as Uint8Array[], opts);
}

/**
 * Creates a new block header object from Ethereum JSON RPC.
 *
 * @param blockParams - Ethereum JSON RPC of block (eth_getBlockByNumber)
 * @param options - An object describing the blockchain
 */
export function createBlockHeaderFromRPC(
	blockParams: JSONRPCBlock,
	options?: BlockOptions,
) {
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
	} = blockParams;

	const blockHeader = new BlockHeader(
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
		},
		options,
	);

	return blockHeader;
}
