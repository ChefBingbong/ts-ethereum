import type { HardforkManager } from '@ts-ethereum/chain-config'
import { Hardfork } from '@ts-ethereum/chain-config'
import { z, zBigInt, zBytes32 } from '@ts-ethereum/schema'
import {
  BIGINT_0,
  BIGINT_7,
  EthereumJSErrorWithoutCode,
  hexToBytes,
  KECCAK256_RLP,
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
  header: HeaderData
  hardforkManager: HardforkManager
  validateConsensus?: boolean
}) {
  const { hardforkManager: common, validateConsensus = true } = opts

  const blockNumber = zBigInt().parse(opts.header.number ?? 0)
  // For post-merge chains, timestamp is required to determine the correct hardfork
  const timestamp =
    opts.header.timestamp !== undefined
      ? zBigInt().parse(opts.header.timestamp)
      : undefined
  const blockContext = { blockNumber, timestamp }

  return zCoreHeaderSchema
    .extend({
      // EIP-1559: baseFeePerGas (default is BIGINT_2 for non-London blocks)
      baseFeePerGas: common.isEIPActiveAtBlock(1559, blockContext)
        ? zBigInt({
            defaultValue:
              opts.header.number === common.hardforkBlock(Hardfork.London)
                ? common.getParamAtHardfork('initialBaseFee', Hardfork.London)
                : BIGINT_7,
          })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'baseFeePerGas cannot be set before EIP-1559',
          }),
      // EIP-4895: withdrawalsRoot
      withdrawalsRoot: common.isEIPActiveAtBlock(4895, blockContext)
        ? zBytes32({ defaultValue: KECCAK256_RLP })
        : zOptionalBytes32.refine((val) => val === undefined, {
            message: 'withdrawalsRoot cannot be set before EIP-4895',
          }),

      // EIP-4844: blobGasUsed
      blobGasUsed: common.isEIPActiveAtBlock(4844, blockContext)
        ? zBigInt({ defaultValue: BIGINT_0 })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'blobGasUsed cannot be set before EIP-4844',
          }),

      // EIP-4844: excessBlobGas
      excessBlobGas: common.isEIPActiveAtBlock(4844, blockContext)
        ? zBigInt({ defaultValue: BIGINT_0 })
        : zOptionalBigInt.refine((val) => val === undefined, {
            message: 'excessBlobGas cannot be set before EIP-4844',
          }),

      // EIP-4788: parentBeaconBlockRoot
      parentBeaconBlockRoot: common.isEIPActiveAtBlock(4788, blockContext)
        ? zBytes32({ defaultValue: new Uint8Array(32) })
        : zOptionalBytes32.refine((val) => val === undefined, {
            message: 'parentBeaconBlockRoot cannot be set before EIP-4788',
          }),

      // EIP-7685: requestsHash
      requestsHash: common.isEIPActiveAtBlock(7685, blockContext)
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
      if (common.isEIPActiveAtBlock(1559, blockContext)) {
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
            const initialBaseFee = common.getParamAtHardfork(
              'initialBaseFee',
              Hardfork.London,
            )
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
      if (
        common.isEIPActiveAtBlock(4895, blockContext) &&
        data.withdrawalsRoot === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-4895 requires withdrawalsRoot',
          path: ['withdrawalsRoot'],
        })
      }

      // EIP-4788: parentBeaconBlockRoot requirements
      if (
        common.isEIPActiveAtBlock(4788, blockContext) &&
        data.parentBeaconBlockRoot === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-4788 requires parentBeaconBlockRoot',
          path: ['parentBeaconBlockRoot'],
        })
      }

      // EIP-7685: requestsHash requirements
      if (
        common.isEIPActiveAtBlock(7685, blockContext) &&
        data.requestsHash === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EIP-7685 requires requestsHash',
          path: ['requestsHash'],
        })
      }

      // DAO fork extra data validation
      const daoActivationBlock = common.hardforkBlock(Hardfork.Dao)
      if (daoActivationBlock !== null && blockNumber >= daoActivationBlock) {
        const DAO_ExtraData = hexToBytes('0x64616f2d686172642d666f726b')
        const DAO_ForceExtraDataRange = BigInt(9)
        const drift = blockNumber - daoActivationBlock

        // if (
        //   drift <= DAO_ForceExtraDataRange &&
        //   !equalsBytes(data.extraData, DAO_ExtraData)
        // ) {
        //   ctx.addIssue({
        //     code: z.ZodIssueCode.custom,
        //     message: `extraData should be 'dao-hard-fork', got ${bytesToUtf8(data.extraData)} (${bytesToHex(data.extraData)})`,
        //     path: ['extraData'],
        //   })
        // }
      }

      // Consensus format validation
      if (validateConsensus) {
        // PoS validation
        // if (common.consensusType() === 'pos' && data.number !== BIGINT_0) {
        //   if (data.difficulty !== BIGINT_0) {
        //     ctx.addIssue({
        //       code: z.ZodIssueCode.custom,
        //       message: `PoS block must have difficulty 0, got ${data.difficulty}`,
        //       path: ['difficulty'],
        //     })
        //   }
        //   if (data.extraData.length > 32) {
        //     ctx.addIssue({
        //       code: z.ZodIssueCode.custom,
        //       message: `PoS extraData cannot exceed 32 bytes, got ${data.extraData.length}`,
        //       path: ['extraData'],
        //     })
        //   }
        //   if (!equalsBytes(data.nonce, new Uint8Array(8))) {
        //     ctx.addIssue({
        //       code: z.ZodIssueCode.custom,
        //       message: 'PoS block must have zero nonce',
        //       path: ['nonce'],
        //     })
        //   }
        //   if (!equalsBytes(data.uncleHash, KECCAK256_RLP_ARRAY)) {
        //     ctx.addIssue({
        //       code: z.ZodIssueCode.custom,
        //       message: 'PoS block must have empty uncle hash',
        //       path: ['uncleHash'],
        //     })
        //   }
        // }
        // PoW/Ethash extraData validation
        const consensusAlgorithm =
          common.config.spec.chain?.consensus?.algorithm ?? 'ethash'
        const maxExtraDataSize =
          common.getParamAtHardfork(
            'maxExtraDataSize',
            common.getHardforkByBlock(blockNumber),
          ) ?? 32n
        if (
          consensusAlgorithm === 'ethash' &&
          data.number > BIGINT_0 &&
          BigInt(data.extraData.length) > maxExtraDataSize
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
  hardforkManager: HardforkManager
  validateConsensus: boolean
}): ValidatedHeader {
  const schema = createBlockHeaderSchema(opts)
  const result = schema.safeParse(opts.header)

  if (!result.success) {
    throw EthereumJSErrorWithoutCode(result.error.message)
  }
  return result.data
}
