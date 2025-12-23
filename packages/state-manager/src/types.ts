import type { Caches } from ".";
import type { Common } from "../chain-config";
import type { MerklePatriciaTrie } from "../mpt";
import type { PrefixedHexString } from "../utils";

/**
 * Basic state manager options (not to be used directly)
 */
interface BaseStateManagerOpts {
	/**
	 * The common to use
	 */
	common: Common;
}

/**
 * Options for constructing a {@link SimpleStateManager}.
 */
export interface SimpleStateManagerOpts extends BaseStateManagerOpts {
	// Keep this as an alias so that it might be able to extend in the future
}

export interface RPCStateManagerOpts extends BaseStateManagerOpts {
	provider: string;
	blockTag: bigint | "earliest";
}

/**
 * Options for constructing a {@link MerkleStateManager}.
 */
export interface MerkleStateManagerOpts extends BaseStateManagerOpts {
	/**
	 * A {@link MerklePatriciaTrie} instance
	 */
	trie?: MerklePatriciaTrie;

	/**
	 * Options to enable and configure the use of an account cache.
	 * This can be useful for speeding up reads, especially when the trie is large.
	 *
	 * Default: false
	 */
	caches?: Caches;
}

/**
 * Proof type for account proofs.
 */
export type Proof = {
	address: PrefixedHexString;
	balance: PrefixedHexString;
	codeHash: PrefixedHexString;
	nonce: PrefixedHexString;
	storageHash: PrefixedHexString;
	accountProof: PrefixedHexString[];
};
