import {
  TypeOutput,
  z,
  zAddress,
  zBigInt,
  zBytes,
  zBytes32,
  zBytesVar,
  zFlexibleType,
} from '@ts-ethereum/schema'
import {
  BIGINT_0,
  createZeroAddress,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
} from '@ts-ethereum/utils'

const DEFAULT_GAS_LIMIT = BigInt('0xffffffffffffff')

export const coreDefaults = {
  parentHash: new Uint8Array(32),
  uncleHash: KECCAK256_RLP_ARRAY,
  coinbase: createZeroAddress(),
  stateRoot: new Uint8Array(32),
  transactionsTrie: KECCAK256_RLP,
  receiptTrie: KECCAK256_RLP,
  logsBloom: new Uint8Array(256),
  difficulty: BIGINT_0,
  number: BIGINT_0,
  gasLimit: DEFAULT_GAS_LIMIT,
  gasUsed: BIGINT_0,
  timestamp: BIGINT_0,
  extraData: new Uint8Array(0),
  mixHash: new Uint8Array(32),
  nonce: new Uint8Array(8),
}

export const zCoreHeaderSchema = z.object({
  parentHash: zBytes32({
    defaultValue: coreDefaults.parentHash,
    errorMessage: 'parentHash must be 32 bytes',
  }),
  uncleHash: zBytes32({
    defaultValue: coreDefaults.uncleHash,
    errorMessage: 'uncleHash must be 32 bytes',
  }),
  coinbase: zAddress({
    defaultValue: coreDefaults.coinbase,
    errorMessage: 'coinbase must be a valid 20-byte address',
  }),
  stateRoot: zBytes32({
    defaultValue: coreDefaults.stateRoot,
    errorMessage: 'stateRoot must be 32 bytes',
  }),
  transactionsTrie: zBytes32({
    defaultValue: coreDefaults.transactionsTrie,
    errorMessage: 'transactionsTrie must be 32 bytes',
  }),
  receiptTrie: zBytes32({
    defaultValue: coreDefaults.receiptTrie,
    errorMessage: 'receiptTrie must be 32 bytes',
  }),
  logsBloom: zBytes(256, coreDefaults.logsBloom),
  difficulty: zBigInt({ defaultValue: coreDefaults.difficulty }),
  number: zBigInt({ defaultValue: coreDefaults.number }),
  gasLimit: zBigInt({ defaultValue: coreDefaults.gasLimit }),
  gasUsed: zBigInt({ defaultValue: coreDefaults.gasUsed }),
  timestamp: zBigInt({ defaultValue: coreDefaults.timestamp }),
  extraData: zBytesVar(coreDefaults.extraData),
  mixHash: zBytes32({
    defaultValue: coreDefaults.mixHash,
    errorMessage: 'mixHash must be 32 bytes',
  }),
  nonce: zBytes(8, coreDefaults.nonce, 'nonce must be 8 bytes'),
})

export const zOptionalBytes32 = zFlexibleType({
  outputType: TypeOutput.Uint8Array,
  byteLength: 32,
}).optional()

export const zOptionalBigInt = zBigInt({}).optional()

export const zEIPFieldsSchema = z.object({
  baseFeePerGas: zOptionalBigInt,
  withdrawalsRoot: zOptionalBytes32,
  blobGasUsed: zOptionalBigInt,
  excessBlobGas: zOptionalBigInt,
  parentBeaconBlockRoot: zOptionalBytes32,
  requestsHash: zOptionalBytes32,
})

export const zBlockHeaderSchema = zCoreHeaderSchema.merge(zEIPFieldsSchema)

export type ValidatedCoreHeaderFields = z.infer<typeof zCoreHeaderSchema>
export type ValidatedEIPHeaderFields = z.infer<typeof zEIPFieldsSchema>
export type ValidatedHeader = z.infer<typeof zBlockHeaderSchema>
