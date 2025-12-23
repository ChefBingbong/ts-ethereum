import { keccak256 } from "ethereum-cryptography/keccak.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import {
	Address,
	BIGINT_0,
	bigIntToUnpaddedBytes,
	bytesToHex,
	ecrecover,
	EthereumJSErrorWithoutCode,
	publicToAddress,
	SECP256K1_ORDER_DIV_2,
	unpadBytes,
} from "../../utils";
import type {
	LegacyTxInterface,
	Transaction,
	TransactionType,
} from "../types.ts";

/**
 * Creates an error message with transaction context
 * @param tx - The transaction interface
 * @param msg - The error message
 * @returns Formatted error message with transaction context
 */
export function errorMsg(tx: LegacyTxInterface, msg: string) {
	return `${msg} (${tx.errorStr()})`;
}

/**
 * Checks if a transaction is signed
 * @param tx - The transaction interface
 * @returns true if the transaction is signed
 */
export function isSigned(tx: LegacyTxInterface): boolean {
	const { v, r, s } = tx;
	if (v === undefined || r === undefined || s === undefined) {
		return false;
	} else {
		return true;
	}
}

/**
 * The amount of gas paid for the data in this tx
 */
export function getDataGas(tx: LegacyTxInterface): bigint {
	if (tx.cache.dataFee && tx.cache.dataFee.hardfork === tx.common.hardfork()) {
		return tx.cache.dataFee.value;
	}

	const txDataZero = tx.common.param("txDataZeroGas");
	const txDataNonZero = tx.common.param("txDataNonZeroGas");

	let cost = BIGINT_0;
	for (let i = 0; i < tx.data.length; i++) {
		tx.data[i] === 0 ? (cost += txDataZero) : (cost += txDataNonZero);
	}

	// No EIP-3860 initcode cost in Frontier

	if (Object.isFrozen(tx)) {
		tx.cache.dataFee = {
			value: cost,
			hardfork: tx.common.hardfork(),
		};
	}

	return cost;
}

/**
 * The minimum gas limit which the tx to have to be valid.
 * This covers costs as the standard fee (21000 gas) and the data fee (paid for each calldata byte).
 * Note: Contract creation is not supported, so no creation fee is added.
 */
export function getIntrinsicGas(tx: LegacyTxInterface): bigint {
	const txFee = tx.common.param("txGas");
	let fee = tx.getDataGas();
	if (txFee) fee += txFee;
	return fee;
}

/**
 * Checks if the transaction targets the creation address (deploys a contract).
 * @param tx - Transaction interface to inspect
 * @returns true if the transaction's `to` is undefined or empty
 */
export function toCreationAddress(tx: LegacyTxInterface): boolean {
	return tx.to === undefined || tx.to.bytes.length === 0;
}

/**
 * Computes the keccak256 hash of a signed legacy transaction.
 * @param tx - Transaction to hash
 * @returns Hash of the serialized transaction
 * @throws EthereumJSErrorWithoutCode if the transaction is unsigned
 */
export function hash(tx: LegacyTxInterface): Uint8Array {
	if (!tx.isSigned()) {
		const msg = errorMsg(
			tx,
			"Cannot call hash method if transaction is not signed",
		);
		throw EthereumJSErrorWithoutCode(msg);
	}

	const keccakFunction = keccak256;

	if (Object.isFrozen(tx)) {
		tx.cache.hash ??= keccakFunction(tx.serialize());
		return tx.cache.hash;
	}

	return keccakFunction(tx.serialize());
}

/**
 * EIP-2: All transaction signatures whose s-value is greater than secp256k1n/2 are considered invalid.
 * Note: This is from Homestead, but we apply it for safety in Frontier too.
 */
export function validateHighS(tx: LegacyTxInterface): void {
	const { s } = tx;
	if (s !== undefined && s > SECP256K1_ORDER_DIV_2) {
		const msg = errorMsg(
			tx,
			"Invalid Signature: s-values greater than secp256k1n/2 are considered invalid",
		);
		throw EthereumJSErrorWithoutCode(msg);
	}
}

/**
 * Recovers the sender's public key from the transaction signature.
 * Supports both pre-EIP-155 (v = 27 or 28) and EIP-155 (v = chainId * 2 + 35 or 36) signatures.
 * @param tx - Transaction from which the public key should be derived
 * @returns The uncompressed sender public key
 * @throws EthereumJSErrorWithoutCode if the signature is invalid
 */
export function getSenderPublicKey(tx: LegacyTxInterface): Uint8Array {
	if (tx.cache.senderPubKey !== undefined) {
		return tx.cache.senderPubKey;
	}

	const msgHash = tx.getMessageToVerifySignature();

	const { v, r, s } = tx;

	validateHighS(tx);

	// Detect if this is an EIP-155 signature by checking v value
	// Pre-EIP-155: v = 27 or 28
	// EIP-155: v = chainId * 2 + 35 or chainId * 2 + 36
	const vNum = Number(v!);
	const isEIP155 = vNum !== 27 && vNum !== 28;
	const chainId = isEIP155 ? tx.common.chainId() : undefined;

	try {
		const ecrecoverFunction = tx.common.customCrypto?.ecrecover ?? ecrecover;
		const sender = ecrecoverFunction(
			msgHash,
			v!,
			bigIntToUnpaddedBytes(r!),
			bigIntToUnpaddedBytes(s!),
			chainId,
		);
		if (Object.isFrozen(tx)) {
			tx.cache.senderPubKey = sender;
		}
		return sender;
	} catch {
		const msg = errorMsg(tx, "Invalid Signature");
		throw EthereumJSErrorWithoutCode(msg);
	}
}

/**
 * Calculates the effective priority fee for a legacy-style transaction.
 * @param gasPrice - Gas price specified on the transaction
 * @param baseFee - Optional base fee (not used in Frontier, kept for interface compatibility)
 * @returns The priority fee portion that can be paid to the block producer
 */
export function getEffectivePriorityFee(
	gasPrice: bigint,
	baseFee: bigint | undefined,
): bigint {
	if (baseFee !== undefined && baseFee > gasPrice) {
		throw EthereumJSErrorWithoutCode("Tx cannot pay baseFee");
	}

	if (baseFee === undefined) {
		return gasPrice;
	}

	return gasPrice - baseFee;
}

/**
 * Validates the transaction signature and minimum gas requirements.
 * @returns {string[]} an array of error strings
 */
export function getValidationErrors(tx: LegacyTxInterface): string[] {
	const errors = [];

	if (tx.isSigned() && !tx.verifySignature()) {
		errors.push("Invalid Signature");
	}

	const intrinsicGas = tx.getIntrinsicGas();
	// No EIP-7623 floor cost in Frontier

	if (intrinsicGas > tx.gasLimit) {
		errors.push(
			`gasLimit is too low. The gasLimit is lower than the minimum gas limit of ${tx.getIntrinsicGas()}, the gas limit is: ${tx.gasLimit}`,
		);
	}

	return errors;
}

/**
 * Validates the transaction signature and minimum gas requirements.
 * @returns {boolean} true if the transaction is valid, false otherwise
 */
export function isValid(tx: LegacyTxInterface): boolean {
	const errors = tx.getValidationErrors();

	return errors.length === 0;
}

/**
 * Determines if the signature is valid
 */
export function verifySignature(tx: LegacyTxInterface): boolean {
	try {
		// Main signature verification is done in `getSenderPublicKey()`
		const publicKey = tx.getSenderPublicKey();
		return unpadBytes(publicKey).length !== 0;
	} catch {
		return false;
	}
}

/**
 * Returns the sender's address
 */
export function getSenderAddress(tx: LegacyTxInterface): Address {
	return new Address(publicToAddress(tx.getSenderPublicKey()));
}

/**
 * Signs a transaction.
 *
 * Note that the signed tx is returned as a new object,
 * use as follows:
 * ```javascript
 * const signedTx = tx.sign(privateKey)
 * ```
 */
export function sign(
	tx: LegacyTxInterface,
	privateKey: Uint8Array,
	extraEntropy: Uint8Array | boolean = true,
): Transaction[TransactionType] {
	if (privateKey.length !== 32) {
		const msg = errorMsg(tx, "Private key must be 32 bytes in length.");
		throw EthereumJSErrorWithoutCode(msg);
	}

	// For Frontier, we use simple v=27/28 signature without EIP-155 replay protection
	const msgHash = tx.getHashedMessageToSign();
	const ecSignFunction = tx.common.customCrypto?.ecsign ?? secp256k1.sign;
	const { recovery, r, s } = ecSignFunction(msgHash, privateKey, {
		extraEntropy,
	});
	const signedTx = tx.addSignature(BigInt(recovery), r, s, true);

	return signedTx;
}

/**
 * Builds a compact string that summarizes common transaction fields for error messages.
 * @param tx - Transaction used to assemble the postfix
 * @returns A formatted string containing tx type, hash, nonce, value, signature status, and hardfork
 */
export function getSharedErrorPostfix(tx: LegacyTxInterface) {
	let hash = "";
	try {
		hash = tx.isSigned() ? bytesToHex(tx.hash()) : "not available (unsigned)";
	} catch {
		hash = "error";
	}
	let isSigned = "";
	try {
		isSigned = tx.isSigned().toString();
	} catch {
		hash = "error";
	}
	let hf = "";
	try {
		hf = tx.common.hardfork();
	} catch {
		hf = "error";
	}

	let postfix = `tx type=${tx.type} hash=${hash} nonce=${tx.nonce} value=${tx.value} `;
	postfix += `signed=${isSigned} hf=${hf}`;

	return postfix;
}
