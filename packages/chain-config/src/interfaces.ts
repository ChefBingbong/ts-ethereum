/**
 * External Interfaces for other EthereumJS libraries
 */

import type {
	Account,
	Address,
	BinaryTreeExecutionWitness,
	PrefixedHexString,
} from '@ts-ethereum/utils'

export type AccountFields = Partial<
  Pick<Account, 'nonce' | 'balance' | 'storageRoot' | 'codeHash' | 'codeSize'>
>

export type Proof = {
  address: PrefixedHexString
  balance: PrefixedHexString
  codeHash: PrefixedHexString
  nonce: PrefixedHexString
  storageHash: PrefixedHexString
  accountProof: PrefixedHexString[]
}

/**
 * Binary tree related
 *
 * Experimental (do not implement)
 */
export type AccessEventFlags = {
  stemRead: boolean
  stemWrite: boolean
  chunkRead: boolean
  chunkWrite: boolean
  chunkFill: boolean
}

export type BinaryTreeAccessedStateType =
  (typeof BinaryTreeAccessedStateType)[keyof typeof BinaryTreeAccessedStateType]

export const BinaryTreeAccessedStateType = {
  BasicData: 'basicData',
  CodeHash: 'codeHash',
  Code: 'code',
  Storage: 'storage',
} as const

export type RawBinaryTreeAccessedState = {
  address: Address
  treeIndex: number | bigint
  chunkIndex: number
  chunkKey: PrefixedHexString
}

export type BinaryTreeAccessedState =
  | {
      type: Exclude<
        BinaryTreeAccessedStateType,
        | typeof BinaryTreeAccessedStateType.Code
        | typeof BinaryTreeAccessedStateType.Storage
      >
    }
  | { type: typeof BinaryTreeAccessedStateType.Code; codeOffset: number }
  | { type: typeof BinaryTreeAccessedStateType.Storage; slot: bigint }

export type BinaryTreeAccessedStateWithAddress = BinaryTreeAccessedState & {
  address: Address
  chunkKey: PrefixedHexString
}
export interface BinaryTreeAccessWitnessInterface {
  accesses(): Generator<BinaryTreeAccessedStateWithAddress>
  rawAccesses(): Generator<RawBinaryTreeAccessedState>
  debugWitnessCost(): void
  readAccountBasicData(address: Address): bigint
  writeAccountBasicData(address: Address): bigint
  readAccountCodeHash(address: Address): bigint
  writeAccountCodeHash(address: Address): bigint
  readAccountHeader(address: Address): bigint
  writeAccountHeader(address: Address): bigint
  readAccountCodeChunks(
    contract: Address,
    startPc: number,
    endPc: number,
  ): bigint
  writeAccountCodeChunks(
    contract: Address,
    startPc: number,
    endPc: number,
  ): bigint
  readAccountStorage(contract: Address, storageSlot: bigint): bigint
  writeAccountStorage(contract: Address, storageSlot: bigint): bigint
  merge(accessWitness: BinaryTreeAccessWitnessInterface): void
  commit(): void
  revert(): void
}

/*
 * Generic StateManager interface corresponding with the ../../statemanager package
 *
 */
export interface StateManagerInterface {
  /*
   * Core Access Functionality
   */
  // Account methods
  getAccount(address: Address): Promise<Account | undefined>
  putAccount(address: Address, account?: Account): Promise<void>
  deleteAccount(address: Address): Promise<void>
  modifyAccountFields(
    address: Address,
    accountFields: AccountFields,
  ): Promise<void>

  /*
   * Checkpointing Functionality
   */
  checkpoint(): Promise<void>
  commit(): Promise<void>
  revert(): Promise<void>

  /*
   * State Root Functionality
   */
  getStateRoot(): Promise<Uint8Array>
  setStateRoot(stateRoot: Uint8Array, clearCache?: boolean): Promise<void>
  hasStateRoot(root: Uint8Array): Promise<boolean> // only used in client

  /*
   * Extra Functionality
   *
   * Optional non-essential methods, these methods should always be guarded
   * on usage (check for existence)
   */
  generateCanonicalGenesis?(initState: any): Promise<void> // TODO make input more typesafe
  initBinaryTreeExecutionWitness?(
    blockNum: bigint,
    executionWitness?: BinaryTreeExecutionWitness | null,
  ): void
  verifyBinaryTreePostState?(
    accessWitness: BinaryTreeAccessWitnessInterface,
  ): Promise<boolean>
  checkChunkWitnessPresent?(
    contract: Address,
    programCounter: number,
  ): Promise<boolean>
  getAppliedKey?(address: Uint8Array): Uint8Array // only for preimages

  /*
   * Utility
   */
  clearCaches(): void
  shallowCopy(downlevelCaches?: boolean): StateManagerInterface
}
