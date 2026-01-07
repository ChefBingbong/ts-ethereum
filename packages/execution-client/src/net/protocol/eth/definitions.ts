import {
  type Block,
  type BlockBodyBytes,
  type BlockBytes,
  type BlockHeader,
  type BlockHeaderBytes,
  createBlockFromBytesArray,
  createBlockHeaderFromBytesArray,
} from '@ts-ethereum/block'
import { RLP } from '@ts-ethereum/rlp'
import {
  createBlob4844TxFromSerializedNetworkWrapper,
  createTxFromBlockBodyData,
  createTxFromRLP,
  isAccessList2930Tx,
  isBlob4844Tx,
  isEOACode7702Tx,
  isFeeMarket1559Tx,
  isLegacyTx,
  TransactionType,
  type TypedTransaction,
} from '@ts-ethereum/tx'
import {
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToInt,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  intToUnpaddedBytes,
  isNestedUint8Array,
  type PrefixedHexString,
} from '@ts-ethereum/utils'
import {
  encodeReceipt,
  type PostByzantiumTxReceipt,
  type PreByzantiumTxReceipt,
  type TxReceipt,
} from '@ts-ethereum/vm'
import type { TxReceiptWithType } from '../../../execution/receipt'

type Log = [address: Uint8Array, topics: Uint8Array[], data: Uint8Array]

function exhaustiveTypeGuard(_value: never, errorMsg: string): never {
  throw EthereumJSErrorWithoutCode(errorMsg)
}

export const ETH_PROTOCOL_NAME = 'eth' as const

export const ETH_PROTOCOL_VERSIONS = {
  ETH62: 62,
  ETH63: 63,
  ETH64: 64,
  ETH65: 65,
  ETH66: 66,
  ETH67: 67,
  ETH68: 68,
} as const

export type EthProtocolVersion =
  (typeof ETH_PROTOCOL_VERSIONS)[keyof typeof ETH_PROTOCOL_VERSIONS]

export enum EthMessageCode {
  STATUS = 0x00,
  NEW_BLOCK_HASHES = 0x01,
  TRANSACTIONS = 0x02,
  GET_BLOCK_HEADERS = 0x03,
  BLOCK_HEADERS = 0x04,
  GET_BLOCK_BODIES = 0x05,
  BLOCK_BODIES = 0x06,
  NEW_BLOCK = 0x07,

  NEW_POOLED_TRANSACTION_HASHES = 0x08,
  GET_POOLED_TRANSACTIONS = 0x09,
  POOLED_TRANSACTIONS = 0x0a,

  GET_NODE_DATA = 0x0d,
  NODE_DATA = 0x0e,

  GET_RECEIPTS = 0x0f,
  RECEIPTS = 0x10,
}

export const ETH_MESSAGE_CODE_NAMES: Record<EthMessageCode, string> = {
  [EthMessageCode.STATUS]: 'STATUS',
  [EthMessageCode.NEW_BLOCK_HASHES]: 'NEW_BLOCK_HASHES',
  [EthMessageCode.TRANSACTIONS]: 'TRANSACTIONS',
  [EthMessageCode.GET_BLOCK_HEADERS]: 'GET_BLOCK_HEADERS',
  [EthMessageCode.BLOCK_HEADERS]: 'BLOCK_HEADERS',
  [EthMessageCode.GET_BLOCK_BODIES]: 'GET_BLOCK_BODIES',
  [EthMessageCode.BLOCK_BODIES]: 'BLOCK_BODIES',
  [EthMessageCode.NEW_BLOCK]: 'NEW_BLOCK',
  [EthMessageCode.NEW_POOLED_TRANSACTION_HASHES]:
    'NEW_POOLED_TRANSACTION_HASHES',
  [EthMessageCode.GET_POOLED_TRANSACTIONS]: 'GET_POOLED_TRANSACTIONS',
  [EthMessageCode.POOLED_TRANSACTIONS]: 'POOLED_TRANSACTIONS',
  [EthMessageCode.GET_NODE_DATA]: 'GET_NODE_DATA',
  [EthMessageCode.NODE_DATA]: 'NODE_DATA',
  [EthMessageCode.GET_RECEIPTS]: 'GET_RECEIPTS',
  [EthMessageCode.RECEIPTS]: 'RECEIPTS',
}

export enum EthMessageType {
  HANDSHAKE = 'handshake',
  REQUEST = 'request',
  RESPONSE = 'response',
  ANNOUNCEMENT = 'announcement',
}

export interface EthMessageDefinition {
  code: EthMessageCode
  name: string
  type: EthMessageType
  responseCode?: EthMessageCode
  minVersion: EthProtocolVersion
  maxVersion?: EthProtocolVersion
  description?: string
  encode: (...args: any[]) => any
  decode: (...args: any[]) => any
}

export const ETH_MESSAGES = {
  [EthMessageCode.STATUS]: {
    code: EthMessageCode.STATUS,
    name: 'STATUS',
    type: EthMessageType.HANDSHAKE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Initial handshake message with chain status',
    encode: (args: {
      chainId: bigint
      td: bigint
      bestHash: Uint8Array
      genesisHash: Uint8Array
      latestBlock?: bigint
    }) => {
      return {
        chainId: bigIntToUnpaddedBytes(args.chainId),
        td: bigIntToUnpaddedBytes(args.td),
        bestHash: args.bestHash,
        genesisHash: args.genesisHash,
        latestBlock:
          args.latestBlock !== undefined
            ? bigIntToUnpaddedBytes(args.latestBlock)
            : undefined,
      }
    },
    decode: (data: {
      chainId: Uint8Array
      td: Uint8Array
      bestHash: Uint8Array
      genesisHash: Uint8Array
      latestBlock?: Uint8Array
    }) => {
      return {
        chainId: bytesToBigInt(data.chainId),
        td: bytesToBigInt(data.td),
        bestHash: data.bestHash,
        genesisHash: data.genesisHash,
        latestBlock: data.latestBlock
          ? bytesToBigInt(data.latestBlock)
          : undefined,
      }
    },
  },

  [EthMessageCode.NEW_BLOCK_HASHES]: {
    code: EthMessageCode.NEW_BLOCK_HASHES,
    name: 'NEW_BLOCK_HASHES',
    type: EthMessageType.ANNOUNCEMENT,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Announce new block hashes',
    encode: (hashes: any[]) =>
      hashes.map((hn) => [hn[0], bigIntToUnpaddedBytes(hn[1])]),
    decode: (hashes: any[]) =>
      hashes.map((hn) => [hn[0], bytesToBigInt(hn[1])]),
  },
  [EthMessageCode.TRANSACTIONS]: {
    code: EthMessageCode.TRANSACTIONS,
    name: 'TRANSACTIONS',
    type: EthMessageType.ANNOUNCEMENT,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Announce new transactions',
    encode: (txs: TypedTransaction[]) => {
      const serializedTxs = []
      for (const tx of txs) {
        // Don't automatically broadcast blob transactions - they should only be announced using NewPooledTransactionHashes
        if (isBlob4844Tx(tx)) continue
        serializedTxs.push(tx.serialize())
      }
      return serializedTxs
    },
    decode: (
      txs: Uint8Array[],
      config: {
        synchronized: boolean
        chainCommon: any
        chain?: {
          headers: { latest?: { number?: bigint; timestamp?: bigint } }
        }
        syncTargetHeight?: bigint
      },
    ) => {
      if (!config.synchronized) return
      const common = config.chainCommon
      // common.setHardforkBy({
      //   blockNumber:
      //     config.chain?.headers.latest?.number ?? // Use latest header number if available OR
      //     config.syncTargetHeight ?? // Use sync target height if available OR
      //     common.hardforkBlock(common.hardfork()) ?? // Use current hardfork block number OR
      //     BIGINT_0, // Use chainstart,
      //   timestamp:
      //     config.chain?.headers.latest?.timestamp ??
      //     BigInt(Math.floor(Date.now() / 1000)),
      // })
      return txs.map((txData) => createTxFromRLP(txData, { common }))
    },
  },
  [EthMessageCode.NEW_BLOCK]: {
    code: EthMessageCode.NEW_BLOCK,
    name: 'NEW_BLOCK',
    type: EthMessageType.ANNOUNCEMENT,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Announce new block',
    encode: ([block, td]: [Block, bigint]) => [
      block.raw(),
      bigIntToUnpaddedBytes(td),
    ],
    decode: (
      [block, td]: [BlockBytes, Uint8Array],
      config: { chainCommon: any },
    ) => [
      createBlockFromBytesArray(block, {
        hardforkManager: config.chainCommon,
        setHardfork: true,
      }),
      td,
    ],
  },

  [EthMessageCode.GET_BLOCK_HEADERS]: {
    code: EthMessageCode.GET_BLOCK_HEADERS,
    name: 'GET_BLOCK_HEADERS',
    type: EthMessageType.REQUEST,
    responseCode: EthMessageCode.BLOCK_HEADERS,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Request block headers',
    encode: (
      {
        reqId,
        block,
        max,
        skip = 0,
        reverse = false,
      }: {
        reqId?: bigint
        block: bigint | Uint8Array
        max: number
        skip?: number
        reverse?: boolean
      },
      nextReqId: { value: bigint },
    ) => [
      bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value),
      [
        typeof block === 'bigint' ? bigIntToUnpaddedBytes(block) : block,
        intToUnpaddedBytes(max),
        intToUnpaddedBytes(skip),
        intToUnpaddedBytes(!reverse ? 0 : 1),
      ],
    ],
    decode: ([reqId, [block, max, skip, reverse]]: any) => ({
      reqId: bytesToBigInt(reqId),
      block: block.length === 32 ? block : bytesToBigInt(block),
      max: bytesToInt(max),
      skip: bytesToInt(skip),
      reverse: bytesToInt(reverse) === 0 ? false : true,
    }),
  },
  [EthMessageCode.BLOCK_HEADERS]: {
    code: EthMessageCode.BLOCK_HEADERS,
    name: 'BLOCK_HEADERS',
    type: EthMessageType.RESPONSE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Response with block headers',
    encode: ({ reqId, headers }: { reqId: bigint; headers: BlockHeader[] }) => [
      bigIntToUnpaddedBytes(reqId),
      headers.map((h) => h.raw()),
    ],
    decode: (
      [reqId, headers]: [Uint8Array, BlockHeaderBytes[]],
      config: { chainCommon: any },
    ) => [
      bytesToBigInt(reqId),
      headers.map((h) => {
        const common = config.chainCommon
        const header = createBlockHeaderFromBytesArray(h, {
          hardforkManager: common,
          setHardfork: true,
        })
        return header
      }),
    ],
  },
  [EthMessageCode.GET_BLOCK_BODIES]: {
    code: EthMessageCode.GET_BLOCK_BODIES,
    name: 'GET_BLOCK_BODIES',
    type: EthMessageType.REQUEST,
    responseCode: EthMessageCode.BLOCK_BODIES,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Request block bodies',
    encode: (
      { reqId, hashes }: { reqId?: bigint; hashes: Uint8Array[] },
      nextReqId: { value: bigint },
    ) => [bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value), hashes],
    decode: ([reqId, hashes]: [Uint8Array, Uint8Array[]]) => ({
      reqId: bytesToBigInt(reqId),
      hashes,
    }),
  },
  [EthMessageCode.BLOCK_BODIES]: {
    code: EthMessageCode.BLOCK_BODIES,
    name: 'BLOCK_BODIES',
    type: EthMessageType.RESPONSE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH62,
    description: 'Response with block bodies',
    encode: ({
      reqId,
      bodies,
    }: {
      reqId: bigint
      bodies: BlockBodyBytes[]
    }) => [bigIntToUnpaddedBytes(reqId), bodies],
    decode: ([reqId, bodies]: [Uint8Array, BlockBodyBytes[]]) => [
      bytesToBigInt(reqId),
      bodies,
    ],
  },

  [EthMessageCode.GET_RECEIPTS]: {
    code: EthMessageCode.GET_RECEIPTS,
    name: 'GET_RECEIPTS',
    type: EthMessageType.REQUEST,
    responseCode: EthMessageCode.RECEIPTS,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH63,
    description: 'Request transaction receipts',
    encode: (
      { reqId, hashes }: { reqId?: bigint; hashes: Uint8Array[] },
      nextReqId: { value: bigint },
    ) => [bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value), hashes],
    decode: ([reqId, hashes]: [Uint8Array, Uint8Array[]]) => ({
      reqId: bytesToBigInt(reqId),
      hashes,
    }),
  },
  [EthMessageCode.RECEIPTS]: {
    code: EthMessageCode.RECEIPTS,
    name: 'RECEIPTS',
    type: EthMessageType.RESPONSE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH63,
    description: 'Response with transaction receipts',
    encode: ({
      reqId,
      receipts,
    }: {
      reqId: bigint
      receipts: TxReceiptWithType[]
    }) => {
      const serializedReceipts = []
      for (const receipt of receipts) {
        const encodedReceipt = encodeReceipt(receipt as any, receipt.txType)
        serializedReceipts.push(encodedReceipt)
      }
      return [bigIntToUnpaddedBytes(reqId), serializedReceipts]
    },
    decode: ([reqId, receipts]: [Uint8Array, Uint8Array[]]) => [
      bytesToBigInt(reqId),
      receipts.map((r) => {
        const decoded = RLP.decode(r[0] >= 0xc0 ? r : r.subarray(1))
        const [stateRootOrStatus, cumulativeGasUsed, logsBloom, logs] =
          decoded as [Uint8Array, Uint8Array, Uint8Array, Log[]]
        const receipt = {
          cumulativeBlockGasUsed: bytesToBigInt(cumulativeGasUsed),
          bitvector: logsBloom,
          logs,
        } as TxReceipt
        if (stateRootOrStatus.length === 32) {
          ;(receipt as PreByzantiumTxReceipt).stateRoot = stateRootOrStatus
        } else {
          ;(receipt as PostByzantiumTxReceipt).status = bytesToInt(
            stateRootOrStatus,
          ) as 0 | 1
        }
        return receipt
      }),
    ],
  },

  [EthMessageCode.GET_NODE_DATA]: {
    code: EthMessageCode.GET_NODE_DATA,
    name: 'GET_NODE_DATA',
    type: EthMessageType.REQUEST,
    responseCode: EthMessageCode.NODE_DATA,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH63,
    maxVersion: ETH_PROTOCOL_VERSIONS.ETH66,
    description: 'Request node data (deprecated in eth67+)',
    encode: (
      { reqId, hashes }: { reqId?: bigint; hashes: Uint8Array[] },
      nextReqId: { value: bigint },
    ) => [bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value), hashes],
    decode: ([reqId, hashes]: [Uint8Array, Uint8Array[]]) => ({
      reqId: bytesToBigInt(reqId),
      hashes,
    }),
  },
  [EthMessageCode.NODE_DATA]: {
    code: EthMessageCode.NODE_DATA,
    name: 'NODE_DATA',
    type: EthMessageType.RESPONSE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH63,
    maxVersion: ETH_PROTOCOL_VERSIONS.ETH66,
    description: 'Response with node data (deprecated in eth67+)',
    encode: ({ reqId, data }: { reqId: bigint; data: any[] }) => [
      bigIntToUnpaddedBytes(reqId),
      data,
    ],
    decode: ([reqId, data]: [Uint8Array, any[]]) => [
      bytesToBigInt(reqId),
      data,
    ],
  },

  [EthMessageCode.NEW_POOLED_TRANSACTION_HASHES]: {
    code: EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
    name: 'NEW_POOLED_TRANSACTION_HASHES',
    type: EthMessageType.ANNOUNCEMENT,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH65,
    description: 'Announce new pooled transaction hashes',
    encode: (
      params:
        | Uint8Array[]
        | [types: number[], sizes: number[], hashes: Uint8Array[]],
    ) => {
      return isNestedUint8Array(params) === true
        ? params
        : [bytesToHex(new Uint8Array(params[0])), params[1], params[2]]
    },
    decode: (
      params:
        | Uint8Array[]
        | [types: PrefixedHexString, sizes: number[], hashes: Uint8Array[]],
    ) => {
      if (isNestedUint8Array(params) === true) {
        return params
      } else {
        const [types, sizes, hashes] = params as [
          PrefixedHexString,
          number[],
          Uint8Array[],
        ]
        return [hexToBytes(types), sizes.map((size) => BigInt(size)), hashes]
      }
    },
  },
  [EthMessageCode.GET_POOLED_TRANSACTIONS]: {
    code: EthMessageCode.GET_POOLED_TRANSACTIONS,
    name: 'GET_POOLED_TRANSACTIONS',
    type: EthMessageType.REQUEST,
    responseCode: EthMessageCode.POOLED_TRANSACTIONS,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH65,
    description: 'Request pooled transactions',
    encode: (
      { reqId, hashes }: { reqId?: bigint; hashes: Uint8Array[] },
      nextReqId: { value: bigint },
    ) => [bigIntToUnpaddedBytes(reqId ?? ++nextReqId.value), hashes],
    decode: ([reqId, hashes]: [Uint8Array, Uint8Array[]]) => ({
      reqId: bytesToBigInt(reqId),
      hashes,
    }),
  },
  [EthMessageCode.POOLED_TRANSACTIONS]: {
    code: EthMessageCode.POOLED_TRANSACTIONS,
    name: 'POOLED_TRANSACTIONS',
    type: EthMessageType.RESPONSE,
    minVersion: ETH_PROTOCOL_VERSIONS.ETH65,
    description: 'Response with pooled transactions',
    encode: ({ reqId, txs }: { reqId: bigint; txs: TypedTransaction[] }) => {
      const serializedTxs = []
      for (const tx of txs) {
        // serialize txs as per type
        if (isBlob4844Tx(tx)) {
          serializedTxs.push(tx.serializeNetworkWrapper())
        } else if (
          isFeeMarket1559Tx(tx) ||
          isAccessList2930Tx(tx) ||
          isEOACode7702Tx(tx)
        ) {
          serializedTxs.push(tx.serialize())
        } else if (isLegacyTx(tx)) {
          serializedTxs.push(tx.raw())
        } else {
          // Dual use for this typeguard:
          // 1. to enable typescript to throw build errors if any tx is missing above
          // 2. to throw error in runtime if some corruption happens
          exhaustiveTypeGuard(
            tx,
            `Invalid transaction type=${(tx as TypedTransaction).type}`,
          )
        }
      }

      return [bigIntToUnpaddedBytes(reqId), serializedTxs]
    },
    decode: (
      [reqId, txs]: [Uint8Array, any[]],
      config: {
        chainCommon: any
        chain?: {
          headers: { latest?: { number?: bigint; timestamp?: bigint } }
        }
        syncTargetHeight?: bigint
      },
    ) => {
      const common = config.chainCommon
      // common.setHardforkBy({
      //   blockNumber:
      //     config.chain?.headers.latest?.number ?? // Use latest header number if available OR
      //     config.syncTargetHeight ?? // Use sync target height if available OR
      //     common.hardforkBlock(common.hardfork()) ?? // Use current hardfork block number OR
      //     BIGINT_0, // Use chainstart,
      //   timestamp:
      //     config.chain?.headers.latest?.timestamp ??
      //     BigInt(Math.floor(Date.now() / 1000)),
      // })
      return [
        bytesToBigInt(reqId),
        txs.map((txData) => {
          // Blob transactions are deserialized with network wrapper
          if (txData[0] === TransactionType.BlobEIP4844) {
            return createBlob4844TxFromSerializedNetworkWrapper(txData, {
              common,
            })
          } else {
            return createTxFromBlockBodyData(txData, { common })
          }
        }),
      ]
    },
  },
} as const satisfies {
  [K in EthMessageCode]: EthMessageDefinition
}

export interface EthVersionCapability {
  name: typeof ETH_PROTOCOL_NAME
  version: EthProtocolVersion
  length: number
  supportedMessages: EthMessageCode[]
  features: string[]
}

const ETH62_MESSAGES: EthMessageCode[] = [
  EthMessageCode.STATUS,
  EthMessageCode.NEW_BLOCK_HASHES,
  EthMessageCode.TRANSACTIONS,
  EthMessageCode.GET_BLOCK_HEADERS,
  EthMessageCode.BLOCK_HEADERS,
  EthMessageCode.GET_BLOCK_BODIES,
  EthMessageCode.BLOCK_BODIES,
  EthMessageCode.NEW_BLOCK,
]

const ETH63_MESSAGES: EthMessageCode[] = [
  ...ETH62_MESSAGES,
  EthMessageCode.GET_NODE_DATA,
  EthMessageCode.NODE_DATA,
  EthMessageCode.GET_RECEIPTS,
  EthMessageCode.RECEIPTS,
]

const ETH65_MESSAGES: EthMessageCode[] = [
  ...ETH63_MESSAGES,
  EthMessageCode.NEW_POOLED_TRANSACTION_HASHES,
  EthMessageCode.GET_POOLED_TRANSACTIONS,
  EthMessageCode.POOLED_TRANSACTIONS,
]

export const ETH_VERSION_CAPABILITIES: Record<
  EthProtocolVersion,
  EthVersionCapability
> = {
  [ETH_PROTOCOL_VERSIONS.ETH62]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH62,
    length: 8,
    supportedMessages: ETH62_MESSAGES,
    features: ['basic_block_sync', 'transaction_propagation'],
  },

  [ETH_PROTOCOL_VERSIONS.ETH63]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH63,
    length: 17,
    supportedMessages: ETH63_MESSAGES,
    features: ['receipts', 'node_data'],
  },

  [ETH_PROTOCOL_VERSIONS.ETH64]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH64,
    length: 17,
    supportedMessages: ETH63_MESSAGES,
    features: ['fork_hash_negotiation'],
  },

  [ETH_PROTOCOL_VERSIONS.ETH65]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH65,
    length: 17,
    supportedMessages: ETH65_MESSAGES,
    features: ['pooled_transactions'],
  },

  [ETH_PROTOCOL_VERSIONS.ETH66]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH66,
    length: 17,
    supportedMessages: ETH65_MESSAGES,
    features: [],
  },

  [ETH_PROTOCOL_VERSIONS.ETH67]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH67,
    length: 17,
    supportedMessages: ETH65_MESSAGES.filter(
      (code) =>
        code !== EthMessageCode.GET_NODE_DATA &&
        code !== EthMessageCode.NODE_DATA,
    ),
    features: ['removed_node_data'],
  },

  [ETH_PROTOCOL_VERSIONS.ETH68]: {
    name: ETH_PROTOCOL_NAME,
    version: ETH_PROTOCOL_VERSIONS.ETH68,
    length: 17,
    supportedMessages: ETH65_MESSAGES.filter(
      (code) =>
        code !== EthMessageCode.GET_NODE_DATA &&
        code !== EthMessageCode.NODE_DATA,
    ),
    features: [],
  },
}

export enum TransportType {
  RLPX = 'rlpx',
  LIBP2P = 'libp2p',
  BASIC = 'basic',
}

export interface TransportRequirement {
  type: TransportType
  requiresEncryption: boolean
  supportsMuxing: boolean
  frameFormat: 'rlpx' | 'length-prefixed' | 'raw'
}

export const ETH_TRANSPORT_REQUIREMENTS: Record<
  TransportType,
  TransportRequirement
> = {
  [TransportType.RLPX]: {
    type: TransportType.RLPX,
    requiresEncryption: true,
    supportsMuxing: false,
    frameFormat: 'rlpx',
  },
  [TransportType.LIBP2P]: {
    type: TransportType.LIBP2P,
    requiresEncryption: true,
    supportsMuxing: true,
    frameFormat: 'length-prefixed',
  },
  [TransportType.BASIC]: {
    type: TransportType.BASIC,
    requiresEncryption: true,
    supportsMuxing: false,
    frameFormat: 'rlpx',
  },
}

export interface EthProtocolOptions {
  useSnappyCompression: boolean
  handshakeTimeout: number
  requestTimeout: number
}

export enum MessageType {
  HANDSHAKE = 'handshake',
  REQUEST = 'request',
  RESPONSE = 'response',
  ANNOUNCEMENT = 'announcement',
}

export interface MessageDefinition {
  code: number
  name: string
  type: MessageType
  responseCode?: number
  minVersion: number
  maxVersion?: number
  description?: string
  encode: (...args: any[]) => any
  decode: (...args: any[]) => any
}

export interface VersionCapability {
  name: string
  version: number
  length: number
  supportedMessages: number[]
  features: string[]
}

export interface TransportRequirement {
  type: TransportType
  requiresEncryption: boolean
  supportsMuxing: boolean
  frameFormat: 'rlpx' | 'length-prefixed' | 'raw'
}

export interface ProtocolOptions {
  config: any // Make config required
  timeout?: number
}

export interface ProtocolSpec<TOptions extends ProtocolOptions> {
  name: string
  versions: number[]
  defaultVersion: number
  messages: Record<number, MessageDefinition>
  versionCapabilities: Record<number, VersionCapability>
  transportRequirements: Record<string, TransportRequirement>
  options: TOptions
}

export interface EthProtocolSpec {
  name: typeof ETH_PROTOCOL_NAME
  versions: EthProtocolVersion[]
  defaultVersion: EthProtocolVersion
  messages: typeof ETH_MESSAGES
  versionCapabilities: typeof ETH_VERSION_CAPABILITIES
  transportRequirements: typeof ETH_TRANSPORT_REQUIREMENTS
  options: EthProtocolOptions // Remove ProtocolOptions - config is passed separately
}

export const ETH_PROTOCOL_SPEC: EthProtocolSpec = {
  name: ETH_PROTOCOL_NAME,
  versions: Object.values(ETH_PROTOCOL_VERSIONS),
  defaultVersion: ETH_PROTOCOL_VERSIONS.ETH67,
  messages: ETH_MESSAGES,
  versionCapabilities: ETH_VERSION_CAPABILITIES,
  transportRequirements: ETH_TRANSPORT_REQUIREMENTS,
  options: {
    useSnappyCompression: true,
    handshakeTimeout: 8000,
    requestTimeout: 8000,
  },
}

export function isMessageSupported(
  code: EthMessageCode,
  version: EthProtocolVersion,
): boolean {
  const message = ETH_MESSAGES[code] as EthMessageDefinition
  if (!message) return false

  if (version < message.minVersion) return false
  if (message.maxVersion !== undefined && version > message.maxVersion)
    return false

  return true
}

export function getSupportedMessages(
  version: EthProtocolVersion,
): EthMessageCode[] {
  return ETH_VERSION_CAPABILITIES[version].supportedMessages
}

export function getEthMessage<TCode extends EthMessageCode>(code: TCode) {
  return ETH_MESSAGES[code]
}

export function getMessageDefinition(
  code: EthMessageCode,
): EthMessageDefinition {
  return ETH_MESSAGES[code]
}

export function getResponseCode(
  requestCode: EthMessageCode,
): EthMessageCode | undefined {
  return (ETH_MESSAGES[requestCode] as EthMessageDefinition)?.responseCode
}

export function isRequest(code: EthMessageCode): boolean {
  return ETH_MESSAGES[code]?.type === EthMessageType.REQUEST
}

export function isResponse(code: EthMessageCode): boolean {
  return ETH_MESSAGES[code]?.type === EthMessageType.RESPONSE
}

export function isAnnouncement(code: EthMessageCode): boolean {
  return ETH_MESSAGES[code]?.type === EthMessageType.ANNOUNCEMENT
}

export function getVersionCapability(
  version: EthProtocolVersion,
): EthVersionCapability {
  return ETH_VERSION_CAPABILITIES[version]
}

export function findHighestSharedVersion(
  versions1: EthProtocolVersion[],
  versions2: EthProtocolVersion[],
): EthProtocolVersion | null {
  const shared = versions1.filter((v) => versions2.includes(v))
  if (shared.length === 0) return null
  return Math.max(...shared) as EthProtocolVersion
}
