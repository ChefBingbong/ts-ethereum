import type { Common, Hardfork, ParamsDict } from "../chain-config";
import type {
	Address,
	AddressLike,
	BigIntLike,
	BytesLike,
	PrefixedHexString,
} from "../utils";
import type { LegacyTx } from "./legacy/tx.ts";

export type Capability = (typeof Capability)[keyof typeof Capability];

/**
 * Can be used in conjunction with {@link Transaction[TransactionType].supports}
 * to query on tx capabilities
 */
export const Capability = {
	/**
	 * Tx supports EIP-155 replay protection
	 * See: [155](https://eips.ethereum.org/EIPS/eip-155) Replay Attack Protection EIP
	 */
	EIP155ReplayProtection: 155,
};

/**
 * The options for initializing a {@link Transaction}.
 */
export interface TxOptions {
	/**
	 * A {@link Common} object defining the chain and hardfork for the transaction.
	 */
	common?: Common;
	/**
	 * Tx parameters sorted by EIP can be found in the exported `paramsTx` dictionary.
	 */
	params?: ParamsDict;
	/**
	 * A transaction object by default gets frozen along initialization.
	 */
	freeze?: boolean;
	/**
	 * Allows unlimited contract code-size init while debugging.
	 */
	allowUnlimitedInitCodeSize?: boolean;
}

export interface TransactionCache {
	hash?: Uint8Array;
	dataFee?: {
		value: bigint;
		hardfork: string | Hardfork;
	};
	senderPubKey?: Uint8Array;
}

export type TransactionType =
	(typeof TransactionType)[keyof typeof TransactionType];

// Only legacy transactions supported
export const TransactionType = {
	Legacy: 0,
} as const;

export interface Transaction {
	[TransactionType.Legacy]: LegacyTx;
}

export type TypedTransaction = LegacyTx;

/**
 * Type guard to check if transaction is a Legacy transaction
 * @param tx - The transaction to check
 * @returns true if transaction is Legacy type
 */
export function isLegacyTx(tx: TypedTransaction): tx is LegacyTx {
	return tx.type === TransactionType.Legacy;
}

export interface TransactionInterface<
	T extends TransactionType = TransactionType,
> {
	readonly common: Common;
	readonly nonce: bigint;
	readonly gasLimit: bigint;
	readonly to?: Address;
	readonly value: bigint;
	readonly data: Uint8Array;
	readonly v?: bigint;
	readonly r?: bigint;
	readonly s?: bigint;
	readonly cache: TransactionCache;
	supports(capability: Capability): boolean;
	type: TransactionType;
	txOptions: TxOptions;
	getIntrinsicGas(): bigint;
	getDataGas(): bigint;
	getUpfrontCost(): bigint;
	toCreationAddress(): boolean;
	raw(): TxValuesArray[T];
	serialize(): Uint8Array;
	getMessageToSign(): Uint8Array | Uint8Array[];
	getHashedMessageToSign(): Uint8Array;
	hash(): Uint8Array;
	getMessageToVerifySignature(): Uint8Array;
	getValidationErrors(): string[];
	isSigned(): boolean;
	isValid(): boolean;
	verifySignature(): boolean;
	getSenderAddress(): Address;
	getSenderPublicKey(): Uint8Array;
	sign(
		privateKey: Uint8Array,
		extraEntropy?: Uint8Array | boolean,
	): Transaction[T];
	toJSON(): JSONTx;
	errorStr(): string;

	addSignature(
		v: bigint,
		r: Uint8Array | bigint,
		s: Uint8Array | bigint,
		convertV?: boolean,
	): Transaction[T];
}

export interface LegacyTxInterface<T extends TransactionType = TransactionType>
	extends TransactionInterface<T> {}

export interface TxData {
	[TransactionType.Legacy]: LegacyTxData;
}

export type TypedTxData = LegacyTxData;

/**
 * Legacy {@link Transaction} Data
 */
export type LegacyTxData = {
	/**
	 * The transaction's nonce.
	 */
	nonce?: BigIntLike;

	/**
	 * The transaction's gas price.
	 */
	gasPrice?: BigIntLike | null;

	/**
	 * The transaction's gas limit.
	 */
	gasLimit?: BigIntLike;

	/**
	 * The transaction's the address is sent to.
	 */
	to?: AddressLike | "";

	/**
	 * The amount of Ether sent.
	 */
	value?: BigIntLike;

	/**
	 * This will contain the data of the message or the init of a contract.
	 */
	data?: BytesLike | "";

	/**
	 * EC recovery ID.
	 */
	v?: BigIntLike;

	/**
	 * EC signature parameter.
	 */
	r?: BigIntLike;

	/**
	 * EC signature parameter.
	 */
	s?: BigIntLike;

	/**
	 * The transaction type (always 0 for legacy)
	 */
	type?: BigIntLike;
};

export interface TxValuesArray {
	[TransactionType.Legacy]: LegacyTxValuesArray;
}

/**
 * Bytes values array for a legacy {@link Transaction}
 */
type LegacyTxValuesArray = Uint8Array[];

/**
 * Generic interface for all tx types with a
 * JSON representation of a transaction.
 */
export interface JSONTx {
	nonce?: PrefixedHexString;
	gasPrice?: PrefixedHexString;
	gasLimit?: PrefixedHexString;
	to?: PrefixedHexString;
	data?: PrefixedHexString;
	v?: PrefixedHexString;
	r?: PrefixedHexString;
	s?: PrefixedHexString;
	value?: PrefixedHexString;
	type?: PrefixedHexString;
}

/*
 * Based on https://ethereum.org/en/developers/docs/apis/json-rpc/
 */
export interface JSONRPCTx {
	blockHash: string | null;
	blockNumber: string | null;
	from: string;
	gas: string;
	gasPrice: string;
	type: string;
	hash: string;
	input: string;
	nonce: string;
	to: string | null;
	transactionIndex: string | null;
	value: string;
	v: string;
	r: string;
	s: string;
}
