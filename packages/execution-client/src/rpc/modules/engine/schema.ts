import { z } from 'zod'

// Common validation patterns for Ethereum types
const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/, 'Invalid hex string')
const bytes8 = z.string().regex(/^0x[0-9a-fA-F]{16}$/, 'Invalid bytes8')
const bytes20 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid bytes20 (address)')
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid bytes32')
const bytes48 = z.string().regex(/^0x[0-9a-fA-F]{96}$/, 'Invalid bytes48')
const bytes256 = z.string().regex(/^0x[0-9a-fA-F]{512}$/, 'Invalid bytes256')
const uint64 = z.string().regex(/^0x[0-9a-fA-F]{1,16}$/, 'Invalid uint64')
const uint256 = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, 'Invalid uint256')
const variableBytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{0,64}$/, 'Invalid variable bytes32')
const blockHash = bytes32

// Withdrawal schema
const withdrawalSchema = z.object({
  index: uint64,
  validatorIndex: uint64,
  address: bytes20,
  amount: uint64,
})

// ExecutionPayload schemas (V1, V2, V3)
const executionPayloadV1Schema = z.object({
  parentHash: blockHash,
  feeRecipient: bytes20,
  stateRoot: bytes32,
  receiptsRoot: bytes32,
  logsBloom: bytes256,
  prevRandao: bytes32,
  blockNumber: uint64,
  gasLimit: uint64,
  gasUsed: uint64,
  timestamp: uint64,
  extraData: variableBytes32,
  baseFeePerGas: uint256,
  blockHash: blockHash,
  transactions: z.array(hexString),
})

const executionPayloadV2Schema = executionPayloadV1Schema.extend({
  withdrawals: z.array(withdrawalSchema),
})

const executionPayloadV3Schema = executionPayloadV2Schema.extend({
  blobGasUsed: uint64,
  excessBlobGas: uint64,
})

// ForkchoiceState schema
const forkchoiceStateSchema = z.object({
  headBlockHash: blockHash,
  safeBlockHash: blockHash,
  finalizedBlockHash: blockHash,
})

// PayloadAttributes schemas (V1, V2, V3)
const payloadAttributesV1Schema = z.object({
  timestamp: uint64,
  prevRandao: bytes32,
  suggestedFeeRecipient: bytes20,
})

const payloadAttributesV2Schema = payloadAttributesV1Schema.extend({
  withdrawals: z.array(withdrawalSchema).optional(),
})

const payloadAttributesV3Schema = payloadAttributesV1Schema.extend({
  withdrawals: z.array(withdrawalSchema),
  parentBeaconBlockRoot: bytes32,
})

// Engine method schemas

// newPayloadV1: [ExecutionPayloadV1]
export const newPayloadV1Schema = z.tuple([executionPayloadV1Schema])

// newPayloadV2: [ExecutionPayloadV1 | ExecutionPayloadV2]
export const newPayloadV2Schema = z.tuple([
  z.union([executionPayloadV1Schema, executionPayloadV2Schema]),
])

// newPayloadV3: [ExecutionPayloadV3, bytes32[], bytes32]
export const newPayloadV3Schema = z.tuple([
  executionPayloadV3Schema,
  z.array(bytes32),
  bytes32,
])

// newPayloadV4: [ExecutionPayloadV3, bytes32[], bytes32, hex[]]
export const newPayloadV4Schema = z.tuple([
  executionPayloadV3Schema,
  z.array(bytes32),
  bytes32,
  z.array(hexString),
])

// forkchoiceUpdatedV1: [ForkchoiceStateV1, PayloadAttributesV1?]
export const forkchoiceUpdatedV1Schema = z.tuple([
  forkchoiceStateSchema,
  payloadAttributesV1Schema.optional().nullable(),
])

// forkchoiceUpdatedV2: [ForkchoiceStateV1, PayloadAttributesV1 | PayloadAttributesV2?]
export const forkchoiceUpdatedV2Schema = z.tuple([
  forkchoiceStateSchema,
  z
    .union([payloadAttributesV1Schema, payloadAttributesV2Schema])
    .optional()
    .nullable(),
])

// forkchoiceUpdatedV3: [ForkchoiceStateV1, PayloadAttributesV3?]
export const forkchoiceUpdatedV3Schema = z.tuple([
  forkchoiceStateSchema,
  payloadAttributesV3Schema.optional().nullable(),
])

// getPayloadV1-V5: [bytes8]
export const getPayloadSchema = z.tuple([bytes8])

// exchangeCapabilities: []
export const exchangeCapabilitiesSchema = z
  .tuple([])
  .or(z.array(z.any()).length(0))

// getPayloadBodiesByHashV1: [[bytes32[]]]
export const getPayloadBodiesByHashV1Schema = z.tuple([z.array(bytes32)])

// getPayloadBodiesByRangeV1: [bytes8, bytes8]
export const getPayloadBodiesByRangeV1Schema = z.tuple([bytes8, bytes8])

// getBlobsV1/V2: [[bytes32[]]]
export const getBlobsSchema = z.tuple([z.array(bytes32)])

// Re-export common types for use in handlers
export {
  bytes8,
  bytes20,
  bytes32,
  bytes48,
  bytes256,
  uint64,
  uint256,
  hexString,
  blockHash,
  withdrawalSchema,
  executionPayloadV1Schema,
  executionPayloadV2Schema,
  executionPayloadV3Schema,
  forkchoiceStateSchema,
  payloadAttributesV1Schema,
  payloadAttributesV2Schema,
  payloadAttributesV3Schema,
}
