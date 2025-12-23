import type { Debugger } from "debug";
import debugDefault from "debug";
import type { Caches, MerkleStateManagerOpts } from ".";
import type { AccountFields, StateManagerInterface } from "../chain-config";
import { Common } from "../chain-config";
import { MerklePatriciaTrie } from "../mpt";
import type { Account, Address } from "../utils";
import {
	createAccount,
	createAccountFromRLP,
	createAddressFromString,
	equalsBytes,
	EthereumJSErrorWithoutCode,
	unprefixedHexToBytes,
} from "../utils";
import { modifyAccountFields } from "./util.ts";

/**
 * Default StateManager implementation for the VM.
 *
 * The state manager abstracts from the underlying data store
 * by providing higher level access to accounts.
 *
 * This implementation only supports value transfers - no smart contracts.
 *
 * The default state manager implementation uses a
 * `../../mpt` trie as a data backend.
 */
export class MerkleStateManager implements StateManagerInterface {
	protected _debug: Debugger;
	protected _caches?: Caches;

	protected _trie: MerklePatriciaTrie;

	public readonly common: Common;

	protected _checkpointCount: number;

	/**
	 * StateManager is run in DEBUG mode (default: false)
	 * Taken from DEBUG environment variable
	 *
	 * Safeguards on debug() calls are added for
	 * performance reasons to avoid string literal evaluation
	 * @hidden
	 */
	protected readonly DEBUG: boolean = false;

	/**
	 * Instantiate the StateManager interface.
	 */
	constructor(opts: MerkleStateManagerOpts) {
		// Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
		// Additional window check is to prevent vite browser bundling (and potentially other) to break
		this.DEBUG =
			// @ts-expect-error - window is not available in Node.js
			typeof window === "undefined"
				? (process?.env?.DEBUG?.includes("ethjs") ?? false)
				: false;

		this._debug = debugDefault("statemanager:merkle");

		this.common = opts.common;

		this._checkpointCount = 0;

		this._trie =
			opts.trie ??
			new MerklePatriciaTrie({ useKeyHashing: true, common: this.common });

		this._caches = opts.caches;
	}

	/**
	 * Gets the account associated with `address` or `undefined` if account does not exist
	 * @param address - Address of the `account` to get
	 */
	async getAccount(address: Address): Promise<Account | undefined> {
		const elem = this._caches?.account?.get(address);
		if (elem !== undefined) {
			return elem.accountRLP !== undefined
				? createAccountFromRLP(elem.accountRLP)
				: undefined;
		}

		const rlp = await this._trie.get(address.bytes);
		const account = rlp !== null ? createAccountFromRLP(rlp) : undefined;
		if (this.DEBUG) {
			this._debug(
				`Get account ${address} from DB (${account ? "exists" : "non-existent"})`,
			);
		}
		this._caches?.account?.put(address, account);
		return account;
	}

	/**
	 * Saves an account into state under the provided `address`.
	 * @param address - Address under which to store `account`
	 * @param account - The account to store or undefined if to be deleted
	 */
	async putAccount(
		address: Address,
		account: Account | undefined,
	): Promise<void> {
		if (this.DEBUG) {
			this._debug(
				`Save account address=${address} nonce=${account?.nonce} balance=${
					account?.balance
				} empty=${account?.isEmpty() ? "yes" : "no"}`,
			);
		}
		if (this._caches?.account === undefined) {
			const trie = this._trie;
			if (account !== undefined) {
				await trie.put(address.bytes, account.serialize());
			} else {
				await trie.del(address.bytes);
			}
		} else {
			if (account !== undefined) {
				this._caches.account?.put(address, account);
			} else {
				this._caches.account?.del(address);
			}
		}
	}

	/**
	 * Gets the account associated with `address`, modifies the given account
	 * fields, then saves the account into state. Account fields can include
	 * `nonce`, `balance`, `storageRoot`, and `codeHash`.
	 * @param address - Address of the account to modify
	 * @param accountFields - Object containing account fields and values to modify
	 */
	async modifyAccountFields(
		address: Address,
		accountFields: AccountFields,
	): Promise<void> {
		await modifyAccountFields(this, address, accountFields);
	}

	/**
	 * Deletes an account from state under the provided `address`.
	 * @param address - Address of the account which should be deleted
	 */
	async deleteAccount(address: Address) {
		if (this.DEBUG) {
			this._debug(`Delete account ${address}`);
		}

		this._caches?.deleteAccount(address);

		if (this._caches?.account === undefined) {
			await this._trie.del(address.bytes);
		}
	}

	/**
	 * Checkpoints the current state of the StateManager instance.
	 * State changes that follow can then be committed by calling
	 * `commit` or `reverted` by calling rollback.
	 */
	async checkpoint(): Promise<void> {
		this._trie.checkpoint();
		this._caches?.checkpoint();
		this._checkpointCount++;
	}

	/**
	 * Commits the current change-set to the instance since the
	 * last call to checkpoint.
	 */
	async commit(): Promise<void> {
		await this._trie.commit();
		this._caches?.commit();
		this._checkpointCount--;

		if (this._checkpointCount === 0) {
			await this.flush();
		}

		if (this.DEBUG) {
			this._debug(`state checkpoint committed`);
		}
	}

	/**
	 * Reverts the current change-set to the instance since the
	 * last call to checkpoint.
	 */
	async revert(): Promise<void> {
		await this._trie.revert();
		this._caches?.revert();

		this._checkpointCount--;

		if (this._checkpointCount === 0) {
			await this.flush();
		}
	}

	/**
	 * Writes all cache items to the trie
	 */
	async flush(): Promise<void> {
		// Only flush account items - no code or storage in value-transfer-only mode
		const accountItems = this._caches?.account?.flush() ?? [];
		for (const item of accountItems) {
			const addressHex = item[0];
			const addressBytes = unprefixedHexToBytes(addressHex);
			const elem = item[1];
			if (elem.accountRLP === undefined) {
				const trie = this._trie;
				await trie.del(addressBytes);
			} else {
				const trie = this._trie;
				await trie.put(addressBytes, elem.accountRLP);
			}
		}
	}

	/**
	 * Gets the state-root of the Merkle-Patricia trie representation
	 * of the state of this StateManager. Will error if there are uncommitted
	 * checkpoints on the instance.
	 * @returns {Promise<Uint8Array>} - Returns the state-root of the `StateManager`
	 */
	async getStateRoot(): Promise<Uint8Array> {
		await this.flush();
		return this._trie.root();
	}

	/**
	 * Sets the state of the instance to that represented
	 * by the provided `stateRoot`. Will error if there are uncommitted
	 * checkpoints on the instance or if the state root does not exist in
	 * the state trie.
	 * @param stateRoot - The state-root to reset the instance to
	 */
	async setStateRoot(
		stateRoot: Uint8Array,
		clearCache: boolean = true,
	): Promise<void> {
		await this.flush();

		if (!equalsBytes(stateRoot, this._trie.EMPTY_TRIE_ROOT)) {
			const hasRoot = await this._trie.checkRoot(stateRoot);
			if (!hasRoot) {
				throw EthereumJSErrorWithoutCode(
					"State trie does not contain state root",
				);
			}
		}

		this._trie.root(stateRoot);
		if (clearCache) {
			this._caches?.clear();
		}
	}

	/**
	 * Initializes the provided genesis state into the state trie.
	 * Will error if there are uncommitted checkpoints on the instance.
	 * @param initState address -> balance | [balance, code, storage]
	 */
	async generateCanonicalGenesis(
		initState: Record<string, bigint | [bigint, unknown?, unknown?, bigint?]>,
	): Promise<void> {
		if (this._checkpointCount !== 0) {
			throw EthereumJSErrorWithoutCode(
				"Cannot create genesis state with uncommitted checkpoints",
			);
		}
		if (this.DEBUG) {
			this._debug(`Save genesis state into the state trie`);
		}
		const addresses = Object.keys(initState);
		for (const address of addresses) {
			const addr = createAddressFromString(address);
			const state = initState[address];
			if (!Array.isArray(state)) {
				// Prior format: address -> balance
				const account = createAccount({ balance: state });
				await this.putAccount(addr, account);
			} else {
				// New format: address -> [balance, code, storage, nonce]
				// Note: code and storage are ignored in value-transfer-only mode
				const [balance, _code, _storage, nonce] = state;
				const account = createAccount({ balance, nonce });
				await this.putAccount(addr, account);
			}
		}
		await this.flush();
	}

	/**
	 * Checks whether there is a state corresponding to a stateRoot
	 */
	async hasStateRoot(root: Uint8Array): Promise<boolean> {
		return this._trie.checkRoot(root);
	}

	/**
	 * Copies the current instance of the `StateManager`
	 * at the last fully committed point, i.e. as if all current
	 * checkpoints were reverted.
	 *
	 * Caches are downleveled (so: adopted for short-term usage)
	 * by default.
	 */
	shallowCopy(downlevelCaches = true): MerkleStateManager {
		const common = this.common.copy();

		const cacheSize = !downlevelCaches ? this._trie["_opts"]["cacheSize"] : 0;
		const trie = this._trie.shallowCopy(false, { cacheSize });

		return new MerkleStateManager({
			common,
			trie,
			caches: this._caches?.shallowCopy(downlevelCaches),
		});
	}

	/**
	 * Clears all underlying caches
	 */
	clearCaches() {
		this._caches?.clear();
	}

	/**
	 * Returns the applied key for a given address
	 * Used for saving preimages
	 * @param address - The address to return the applied key
	 * @returns {Uint8Array} - The applied key (e.g. hashed address)
	 */
	getAppliedKey(address: Uint8Array): Uint8Array {
		return this._trie["appliedKey"](address);
	}
}
