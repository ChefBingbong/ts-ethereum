import {
  type AccountBodyBytes,
  accountBodyFromSlim,
  accountBodyToSlim,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  setLengthLeft,
} from '@ts-ethereum/utils'

export const SNAP_PROTOCOL_NAME = 'snap' as const

export const SNAP_PROTOCOL_VERSIONS = {
  SNAP1: 1,
} as const

export type SnapProtocolVersion =
  (typeof SNAP_PROTOCOL_VERSIONS)[keyof typeof SNAP_PROTOCOL_VERSIONS]

/**
 * SNAP protocol message codes
 */
export enum SnapMessageCode {
  GET_ACCOUNT_RANGE = 0x00,
  ACCOUNT_RANGE = 0x01,
  GET_STORAGE_RANGES = 0x02,
  STORAGE_RANGES = 0x03,
  GET_BYTE_CODES = 0x04,
  BYTE_CODES = 0x05,
  GET_TRIE_NODES = 0x06,
  TRIE_NODES = 0x07,
}

export const SNAP_MESSAGE_CODE_NAMES: Record<SnapMessageCode, string> = {
  [SnapMessageCode.GET_ACCOUNT_RANGE]: 'GET_ACCOUNT_RANGE',
  [SnapMessageCode.ACCOUNT_RANGE]: 'ACCOUNT_RANGE',
  [SnapMessageCode.GET_STORAGE_RANGES]: 'GET_STORAGE_RANGES',
  [SnapMessageCode.STORAGE_RANGES]: 'STORAGE_RANGES',
  [SnapMessageCode.GET_BYTE_CODES]: 'GET_BYTE_CODES',
  [SnapMessageCode.BYTE_CODES]: 'BYTE_CODES',
  [SnapMessageCode.GET_TRIE_NODES]: 'GET_TRIE_NODES',
  [SnapMessageCode.TRIE_NODES]: 'TRIE_NODES',
}

export enum SnapMessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
}

/**
 * Account data as returned by GetAccountRange
 */
export type AccountData = {
  hash: Uint8Array
  body: AccountBodyBytes
}

/**
 * Storage slot data as returned by GetStorageRanges
 */
export type StorageData = {
  hash: Uint8Array
  body: Uint8Array
}

/**
 * Options for GetAccountRange request
 */
export type GetAccountRangeOpts = {
  reqId?: bigint
  root: Uint8Array
  origin: Uint8Array
  limit: Uint8Array
  bytes: bigint
}

/**
 * Options for GetStorageRanges request
 */
export type GetStorageRangesOpts = {
  reqId?: bigint
  root: Uint8Array
  accounts: Uint8Array[]
  origin: Uint8Array
  limit: Uint8Array
  bytes: bigint
}

/**
 * Options for GetByteCodes request
 */
export type GetByteCodesOpts = {
  reqId?: bigint
  hashes: Uint8Array[]
  bytes: bigint
}

/**
 * Options for GetTrieNodes request
 */
export type GetTrieNodesOpts = {
  reqId?: bigint
  root: Uint8Array
  paths: Uint8Array[][]
  bytes: bigint
}

export interface SnapMessageDefinition {
  code: SnapMessageCode
  name: string
  type: SnapMessageType
  responseCode?: SnapMessageCode
  description?: string
  encode: (...args: any[]) => any
  decode: (...args: any[]) => any
}

/**
 * SNAP protocol message definitions with encode/decode functions
 */
export const SNAP_MESSAGES = {
  [SnapMessageCode.GET_ACCOUNT_RANGE]: {
    code: SnapMessageCode.GET_ACCOUNT_RANGE,
    name: 'GET_ACCOUNT_RANGE',
    type: SnapMessageType.REQUEST,
    responseCode: SnapMessageCode.ACCOUNT_RANGE,
    description: 'Request account range with proof',
    encode: (
      { reqId, root, origin, limit, bytes }: GetAccountRangeOpts,
      nextReqId: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value),
      setLengthLeft(root, 32),
      setLengthLeft(origin, 32),
      setLengthLeft(limit, 32),
      bigIntToUnpaddedBytes(bytes),
    ],
    decode: ([reqId, root, origin, limit, bytes]: any) => ({
      reqId: bytesToBigInt(reqId),
      root,
      origin,
      limit,
      bytes: bytesToBigInt(bytes),
    }),
  },

  [SnapMessageCode.ACCOUNT_RANGE]: {
    code: SnapMessageCode.ACCOUNT_RANGE,
    name: 'ACCOUNT_RANGE',
    type: SnapMessageType.RESPONSE,
    description: 'Response with account range and proof',
    encode: (
      {
        reqId,
        accounts,
        proof,
      }: {
        reqId: bigint
        accounts: AccountData[]
        proof: Uint8Array[]
      },
      nextReqId?: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? (nextReqId ? ++nextReqId.value : 0n)),
      accounts.map((account) => [
        setLengthLeft(account.hash, 32),
        accountBodyToSlim(account.body),
      ]),
      proof,
    ],
    decode: (
      [reqId, accounts, proof]: any,
      options?: { convertSlimBody?: boolean },
    ) => ({
      reqId: bytesToBigInt(reqId),
      accounts: accounts.map(
        ([hash, body]: any) =>
          ({
            hash,
            body:
              options?.convertSlimBody === true
                ? accountBodyFromSlim(body)
                : body,
          }) as AccountData,
      ),
      proof,
    }),
  },

  [SnapMessageCode.GET_STORAGE_RANGES]: {
    code: SnapMessageCode.GET_STORAGE_RANGES,
    name: 'GET_STORAGE_RANGES',
    type: SnapMessageType.REQUEST,
    responseCode: SnapMessageCode.STORAGE_RANGES,
    description: 'Request storage ranges for accounts',
    encode: (
      { reqId, root, accounts, origin, limit, bytes }: GetStorageRangesOpts,
      nextReqId: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value),
      setLengthLeft(root, 32),
      accounts.map((acc) => setLengthLeft(acc, 32)),
      origin,
      limit,
      bigIntToUnpaddedBytes(bytes),
    ],
    decode: ([reqId, root, accounts, origin, limit, bytes]: any) => ({
      reqId: bytesToBigInt(reqId),
      root,
      accounts,
      origin,
      limit,
      bytes: bytesToBigInt(bytes),
    }),
  },

  [SnapMessageCode.STORAGE_RANGES]: {
    code: SnapMessageCode.STORAGE_RANGES,
    name: 'STORAGE_RANGES',
    type: SnapMessageType.RESPONSE,
    description: 'Response with storage ranges and proof',
    encode: ({
      reqId,
      slots,
      proof,
    }: {
      reqId: bigint
      slots: StorageData[][]
      proof: Uint8Array[]
    }) => [
      bigIntToUnpaddedBytes(reqId),
      slots.map((accSlots) =>
        accSlots.map((slotData) => [
          setLengthLeft(slotData.hash, 32),
          slotData.body,
        ]),
      ),
      proof,
    ],
    decode: ([reqId, slots, proof]: any) => ({
      reqId: bytesToBigInt(reqId),
      slots: slots.map((accSlots: any) =>
        accSlots.map(([hash, body]: any) => ({ hash, body }) as StorageData),
      ),
      proof,
    }),
  },

  [SnapMessageCode.GET_BYTE_CODES]: {
    code: SnapMessageCode.GET_BYTE_CODES,
    name: 'GET_BYTE_CODES',
    type: SnapMessageType.REQUEST,
    responseCode: SnapMessageCode.BYTE_CODES,
    description: 'Request contract bytecodes by hash',
    encode: (
      { reqId, hashes, bytes }: GetByteCodesOpts,
      nextReqId: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value),
      hashes.map((hash) => setLengthLeft(hash, 32)),
      bigIntToUnpaddedBytes(bytes),
    ],
    decode: ([reqId, hashes, bytes]: any) => ({
      reqId: bytesToBigInt(reqId),
      hashes,
      bytes: bytesToBigInt(bytes),
    }),
  },

  [SnapMessageCode.BYTE_CODES]: {
    code: SnapMessageCode.BYTE_CODES,
    name: 'BYTE_CODES',
    type: SnapMessageType.RESPONSE,
    description: 'Response with bytecodes',
    encode: ({ reqId, codes }: { reqId: bigint; codes: Uint8Array[] }) => [
      bigIntToUnpaddedBytes(reqId),
      codes,
    ],
    decode: ([reqId, codes]: any) => ({
      reqId: bytesToBigInt(reqId),
      codes,
    }),
  },

  [SnapMessageCode.GET_TRIE_NODES]: {
    code: SnapMessageCode.GET_TRIE_NODES,
    name: 'GET_TRIE_NODES',
    type: SnapMessageType.REQUEST,
    responseCode: SnapMessageCode.TRIE_NODES,
    description: 'Request trie nodes by path',
    encode: (
      { reqId, root, paths, bytes }: GetTrieNodesOpts,
      nextReqId: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value),
      setLengthLeft(root, 32),
      paths,
      bigIntToUnpaddedBytes(bytes),
    ],
    decode: ([reqId, root, paths, bytes]: any) => ({
      reqId: bytesToBigInt(reqId),
      root,
      paths,
      bytes: bytesToBigInt(bytes),
    }),
  },

  [SnapMessageCode.TRIE_NODES]: {
    code: SnapMessageCode.TRIE_NODES,
    name: 'TRIE_NODES',
    type: SnapMessageType.RESPONSE,
    description: 'Response with trie nodes',
    encode: ({ reqId, nodes }: { reqId: bigint; nodes: Uint8Array[] }) => [
      bigIntToUnpaddedBytes(reqId),
      nodes,
    ],
    decode: ([reqId, nodes]: any) => ({
      reqId: bytesToBigInt(reqId),
      nodes,
    }),
  },
} as const satisfies { [K in SnapMessageCode]: SnapMessageDefinition }

/**
 * SNAP protocol version capabilities
 */
export interface SnapVersionCapability {
  name: typeof SNAP_PROTOCOL_NAME
  version: SnapProtocolVersion
  length: number
  supportedMessages: SnapMessageCode[]
}

export const SNAP_VERSION_CAPABILITIES: Record<
  SnapProtocolVersion,
  SnapVersionCapability
> = {
  [SNAP_PROTOCOL_VERSIONS.SNAP1]: {
    name: SNAP_PROTOCOL_NAME,
    version: SNAP_PROTOCOL_VERSIONS.SNAP1,
    length: 8,
    supportedMessages: [
      SnapMessageCode.GET_ACCOUNT_RANGE,
      SnapMessageCode.ACCOUNT_RANGE,
      SnapMessageCode.GET_STORAGE_RANGES,
      SnapMessageCode.STORAGE_RANGES,
      SnapMessageCode.GET_BYTE_CODES,
      SnapMessageCode.BYTE_CODES,
      SnapMessageCode.GET_TRIE_NODES,
      SnapMessageCode.TRIE_NODES,
    ],
  },
}

/**
 * Helper functions
 */
export function getSnapMessage<TCode extends SnapMessageCode>(code: TCode) {
  return SNAP_MESSAGES[code]
}

export function getSnapMessageDefinition(
  code: SnapMessageCode,
): SnapMessageDefinition {
  return SNAP_MESSAGES[code]
}

export function getSnapResponseCode(
  requestCode: SnapMessageCode,
): SnapMessageCode | undefined {
  return (SNAP_MESSAGES[requestCode] as SnapMessageDefinition)?.responseCode
}

export function isSnapRequest(code: SnapMessageCode): boolean {
  return SNAP_MESSAGES[code]?.type === SnapMessageType.REQUEST
}

export function isSnapResponse(code: SnapMessageCode): boolean {
  return SNAP_MESSAGES[code]?.type === SnapMessageType.RESPONSE
}
