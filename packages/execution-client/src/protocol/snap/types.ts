/**
 * SNAP Protocol Handler Types
 */

import type {
  AccountData,
  GetAccountRangeOpts,
  GetByteCodesOpts,
  GetStorageRangesOpts,
  GetTrieNodesOpts,
  StorageData,
} from '../../net/protocol/snap/definitions'

/**
 * Request resolver for async request/response matching
 */
export interface RequestResolver<T = unknown> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

/**
 * SNAP protocol methods interface
 * These are the methods available for making requests to peers
 */
export interface SnapProtocolMethods {
  /**
   * Request account range from peer
   * @param opts Request options including root, origin, limit, bytes
   * @returns Account data array and proof
   */
  getAccountRange(
    opts: Omit<GetAccountRangeOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; accounts: AccountData[]; proof: Uint8Array[] }>

  /**
   * Request storage ranges from peer
   * @param opts Request options including root, accounts, origin, limit, bytes
   * @returns Storage slots array and proof
   */
  getStorageRanges(
    opts: Omit<GetStorageRangesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; slots: StorageData[][]; proof: Uint8Array[] }>

  /**
   * Request bytecodes from peer
   * @param opts Request options including hashes and bytes limit
   * @returns Bytecode array
   */
  getByteCodes(
    opts: Omit<GetByteCodesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; codes: Uint8Array[] }>

  /**
   * Request trie nodes from peer
   * @param opts Request options including root, paths, and bytes limit
   * @returns Trie nodes array
   */
  getTrieNodes(
    opts: Omit<GetTrieNodesOpts, 'reqId'>,
  ): Promise<{ reqId: bigint; nodes: Uint8Array[] }>
}

/**
 * SNAP handler context for handlers that need additional execution context
 */
export type SnapHandlerContext = {}
