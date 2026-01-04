import type { GlobalConfig } from '@ts-ethereum/chain-config'
import { Hardfork } from '@ts-ethereum/chain-config'
import { z, zBigInt, zBytes32 } from '@ts-ethereum/schema'
import {
  BIGINT_0,
  BIGINT_2,
  bytesToHex,
  bytesToUtf8,
  EthereumJSErrorWithoutCode,
  equalsBytes,
  hexToBytes,
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  SHA256_NULL,
} from '@ts-ethereum/utils'
import type { HeaderData } from '../../types'
import {
  type ValidatedHeader,
  zCoreHeaderSchema,
  zOptionalBigInt,
  zOptionalBytes32,
} from './schema'

export function createBlockHeaderSchema(opts: {
  common: GlobalConfig
  validateConsensus?: boolean
}) {
  const { common, validateConsensus = true } = opts

  // Build the schema with all validations
  return zCoreHeaderSchema
    .extend({
      // EIP-1559: baseFeePerGas (default is BIGINT_2 for non-London blocks)
      baseFeePerGas: common.isActivatedEIP(1559)
        ? zBigInt({ defaultValue: BIGINT_2 })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'baseFeePerGas cannot be set before EIP-1559',
          }),

      // EIP-4895: withdrawalsRoot
      withdrawalsRoot: common.isActivatedEIP(4895)
        ? zBytes32({ defaultValue: KECCAK256_RLP })
        : zOptionalBytes32.refine((val) => val === undefined, {
            message: 'withdrawalsRoot cannot be set before EIP-4895',
          }),

      // EIP-4844: blobGasUsed
      blobGasUsed: common.isActivatedEIP(4844)
        ? zBigInt({ defaultValue: BIGINT_0 })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'blobGasUsed cannot be set before EIP-4844',
          }),

      // EIP-4844: excessBlobGas
      excessBlobGas: common.isActivatedEIP(4844)
        ? zBigInt({ defaultValue: BIGINT_0 })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'excessBlobGas cannot be set before EIP-4844',
          }),

      // EIP-4788: parentBeaconBlockRoot
      parentBeaconBlockRoot: common.isActivatedEIP(4788)
        ? zBytes32({ defaultValue: new Uint8Array(32) })
        : zOptionalBytes32.refine((val) => val === undefined, {
            message: 'parentBeaconBlockRoot cannot be set before EIP-4788',
          }),

      // EIP-7685: requestsHash
      requestsHash: common.isActivatedEIP(7685)
        ? zBytes32({ defaultValue: SHA256_NULL })
        : zOptionalBytes32.refine((val) => val === undefined, {
            message: 'requestsHash cannot be set before EIP-7685',
          }),
    })
    .superRefine((data, ctx) => {
      // Gas usage validation
      if (data.gasUsed > data.gasLimit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `gasUsed (${data.gasUsed}) exceeds gasLimit (${data.gasLimit})`,
          path: ['gasUsed'],
        })
      }

      // EIP-1559: baseFeePerGas requirements
      if (common.isActivatedEIP(1559)) {
        if (data.baseFeePerGas === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'EIP-1559 requires baseFeePerGas',
            path: ['baseFeePerGas'],
          })
        } else {
          // Validate initial base fee at London hardfork block
          const londonBlock = common.hardforkBlock(Hardfork.London)
          if (
            typeof londonBlock === 'bigint' &&
            londonBlock !== BIGINT_0 &&
            data.number === londonBlock
          ) {
            const initialBaseFee = common.getParamByEIP(1559, 'initialBaseFee')
            if (data.baseFeePerGas !== initialBaseFee) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Initial EIP-1559 block must have baseFeePerGas of ${initialBaseFee}, got ${data.baseFeePerGas}`,
                path: ['baseFeePerGas'],
              })
            }
          }
        }
      }

      // EIP-4895: withdrawalsRoot requirements
      if (common.isActivatedEIP(4895) && data.withdrawalsRoot === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-4895 requires withdrawalsRoot',
          path: ['withdrawalsRoot'],
        })
      }

      // EIP-4788: parentBeaconBlockRoot requirements
      if (
        common.isActivatedEIP(4788) &&
        data.parentBeaconBlockRoot === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-4788 requires parentBeaconBlockRoot',
          path: ['parentBeaconBlockRoot'],
        })
      }

      // EIP-7685: requestsHash requirements
      if (common.isActivatedEIP(7685) && data.requestsHash === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-7685 requires requestsHash',
          path: ['requestsHash'],
        })
      }

      // DAO fork extra data validation
      if (common.hardforkIsActiveOnBlock(Hardfork.Dao, data.number)) {
        const daoActivationBlock = common.hardforkBlock(Hardfork.Dao)
        if (daoActivationBlock !== null && data.number >= daoActivationBlock) {
          const DAO_ExtraData = hexToBytes('0x64616f2d686172642d666f726b')
          const DAO_ForceExtraDataRange = BigInt(9)
          const drift = data.number - daoActivationBlock

          if (
            drift <= DAO_ForceExtraDataRange &&
            !equalsBytes(data.extraData, DAO_ExtraData)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `extraData should be 'dao-hard-fork', got ${bytesToUtf8(data.extraData)} (${bytesToHex(data.extraData)})`,
              path: ['extraData'],
            })
          }
        }
      }

      // Consensus format validation
      if (validateConsensus) {
        // PoS validation
        if (common.consensusType() === 'pos' && data.number !== BIGINT_0) {
          if (data.difficulty !== BIGINT_0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `PoS block must have difficulty 0, got ${data.difficulty}`,
              path: ['difficulty'],
            })
          }
          if (data.extraData.length > 32) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `PoS extraData cannot exceed 32 bytes, got ${data.extraData.length}`,
              path: ['extraData'],
            })
          }
          if (!equalsBytes(data.nonce, new Uint8Array(8))) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'PoS block must have zero nonce',
              path: ['nonce'],
            })
          }
          if (!equalsBytes(data.uncleHash, KECCAK256_RLP_ARRAY)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'PoS block must have empty uncle hash',
              path: ['uncleHash'],
            })
          }
        }

        // PoW/Ethash extraData validation
        if (
          common.consensusAlgorithm() === 'ethash' &&
          data.number > BIGINT_0 &&
          data.extraData.length > common.param('maxExtraDataSize')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'invalid amount of extra data',
            path: ['extraData'],
          })
        }
      }
    })
}

export function validateBlockHeader(opts: {
  header: HeaderData
  common: GlobalConfig
  validateConsensus: boolean
}): ValidatedHeader {
  const schema = createBlockHeaderSchema(opts)
  const result = schema.safeParse(opts.header)

  if (!result.success) {
    throw EthereumJSErrorWithoutCode(result.error.message)
  }
  return result.data
}
