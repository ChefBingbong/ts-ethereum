import type { AccountFields, StateManagerInterface } from '@ts-ethereum/chain-config'
import { Common } from '@ts-ethereum/chain-config'
import { RLP } from '@ts-ethereum/rlp'
import type { Address } from '@ts-ethereum/utils'
import {
	Account,
	bigIntToHex,
	createAccount,
	createAccountFromRLP,
	equalsBytes,
	EthereumJSErrorWithoutCode,
	fetchFromProvider,
	hexToBytes,
	intToHex,
	toBytes,
} from '@ts-ethereum/utils'
import type { Debugger } from 'debug'
import debugDefault from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import type { RPCStateManagerOpts } from '.'
import { Caches } from './cache'
import { modifyAccountFields } from './util'

const KECCAK256_RLP_EMPTY_ACCOUNT = RLP.encode(new Account().serialize()).slice(
  2,
)

/**
 * RPC-backed state manager for reading account state from an external provider.
 * This implementation only supports value transfers - no smart contracts.
 */
export class RPCStateManager implements StateManagerInterface {
  protected _provider: string
  protected _caches: Caches
  protected _blockTag: string
  protected _debug: Debugger
  protected DEBUG: boolean
  private keccakFunction: (msg: Uint8Array) => Uint8Array
  public readonly common: Common

  constructor(opts: RPCStateManagerOpts) {
    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    // Additional window check is to prevent vite browser bundling (and potentially other) to break
    this.DEBUG = true

    this._debug = debugDefault('statemanager:rpc')
    if (typeof opts.provider === 'string' && opts.provider.startsWith('http')) {
      this._provider = opts.provider
    } else {
      throw EthereumJSErrorWithoutCode(
        `valid RPC provider url required; got ${opts.provider}`,
      )
    }

    this._blockTag =
      opts.blockTag === 'earliest' ? opts.blockTag : bigIntToHex(opts.blockTag)

    this._caches = new Caches({ account: { size: 100000 } })

    this.common = opts.common
    this.keccakFunction = keccak256
  }

  /**
   * Note that the returned statemanager will share the same JSONRPCProvider as the original
   *
   * @returns RPCStateManager
   */
  shallowCopy(): RPCStateManager {
    const newState = new RPCStateManager({
      provider: this._provider,
      blockTag: BigInt(this._blockTag),
      common: this.common,
    })
    newState._caches = new Caches({ account: { size: 100000 } })

    return newState
  }

  /**
   * Sets the new block tag used when querying the provider and clears the
   * internal cache.
   * @param blockTag - the new block tag to use when querying the provider
   */
  setBlockTag(blockTag: bigint | 'earliest'): void {
    this._blockTag = blockTag === 'earliest' ? blockTag : bigIntToHex(blockTag)
    this.clearCaches()
    if (this.DEBUG) this._debug(`setting block tag to ${this._blockTag}`)
  }

  /**
   * Clears the internal cache so all accounts will initially be retrieved from the provider
   */
  clearCaches(): void {
    this._caches.clear()
  }

  /**
   * Gets the account associated with `address` or `undefined` if account does not exist
   * @param address - Address of the `account` to get
   */
  async getAccount(address: Address): Promise<Account | undefined> {
    const elem = this._caches.account?.get(address)
    if (elem !== undefined) {
      return elem.accountRLP !== undefined
        ? createAccountFromRLP(elem.accountRLP)
        : undefined
    }

    const accountFromProvider = await this.getAccountFromProvider(address)
    const account =
      equalsBytes(accountFromProvider.codeHash, new Uint8Array(32)) ||
      equalsBytes(accountFromProvider.serialize(), KECCAK256_RLP_EMPTY_ACCOUNT)
        ? undefined
        : createAccountFromRLP(accountFromProvider.serialize())

    this._caches.account?.put(address, account)

    return account
  }

  /**
   * Retrieves an account from the provider and stores in the local trie
   * @param address Address of account to be retrieved from provider
   * @private
   */
  async getAccountFromProvider(address: Address): Promise<Account> {
    if (this.DEBUG)
      this._debug(
        `retrieving account data from ${address.toString()} from provider`,
      )
    const accountData = await fetchFromProvider(this._provider, {
      method: 'eth_getProof',
      params: [address.toString(), [] as string[], this._blockTag],
    })
    const account = createAccount({
      balance: BigInt(accountData.balance),
      nonce: BigInt(accountData.nonce),
      codeHash: toBytes(accountData.codeHash),
      storageRoot: toBytes(accountData.storageHash),
    })
    return account
  }

  /**
   * Saves an account into state under the provided `address`.
   * @param address - Address under which to store `account`
   * @param account - The account to store
   */
  async putAccount(
    address: Address,
    account: Account | undefined,
  ): Promise<void> {
    if (this.DEBUG) {
      this._debug(
        `Save account address=${address} nonce=${account?.nonce} balance=${
          account?.balance
        } empty=${account?.isEmpty() ? 'yes' : 'no'}`,
      )
    }
    if (account !== undefined) {
      this._caches.account!.put(address, account)
    } else {
      this._caches.account!.del(address)
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
    if (this.DEBUG) {
      this._debug(`modifying account fields for ${address.toString()}`)
      this._debug(
        JSON.stringify(
          accountFields,
          (k, v) => {
            if (k === 'nonce') return v.toString()
            return v
          },
          2,
        ),
      )
    }
    await modifyAccountFields(this, address, accountFields)
  }

  /**
   * Deletes an account from state under the provided `address`.
   * @param address - Address of the account which should be deleted
   */
  async deleteAccount(address: Address) {
    if (this.DEBUG) {
      this._debug(`deleting account corresponding to ${address.toString()}`)
    }
    this._caches.account?.del(address)
  }

  /**
   * Returns the applied key for a given address
   * Used for saving preimages
   * @param address - The address to return the applied key
   * @returns {Uint8Array} - The applied key (e.g. hashed address)
   */
  getAppliedKey(address: Uint8Array): Uint8Array {
    return this.keccakFunction(address)
  }

  /**
   * Checkpoints the current state of the StateManager instance.
   * State changes that follow can then be committed by calling
   * `commit` or `reverted` by calling rollback.
   */
  async checkpoint(): Promise<void> {
    this._caches.checkpoint()
  }

  /**
   * Commits the current change-set to the instance since the
   * last call to checkpoint.
   */
  async commit(): Promise<void> {
    this._caches.account?.commit()
  }

  /**
   * Reverts the current change-set to the instance since the
   * last call to checkpoint.
   */
  async revert(): Promise<void> {
    this._caches.revert()
  }

  async flush(): Promise<void> {
    this._caches.account?.flush()
  }

  /**
   * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
   */
  getStateRoot = async () => {
    return new Uint8Array(32)
  }

  /**
   * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
   */
  setStateRoot = async (_root: Uint8Array) => {}

  /**
   * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
   */
  hasStateRoot = () => {
    throw EthereumJSErrorWithoutCode('function not implemented')
  }
}

export class RPCBlockChain {
  readonly provider: string
  constructor(provider: string) {
    if (provider === undefined || provider === '')
      throw EthereumJSErrorWithoutCode('provider URL is required')
    this.provider = provider
  }
  async getBlock(blockId: number) {
    const block = await fetchFromProvider(this.provider, {
      method: 'eth_getBlockByNumber',
      params: [intToHex(blockId), false],
    })
    return {
      hash: () => hexToBytes(block.hash),
    }
  }

  shallowCopy() {
    return this
  }
}
