import { ConsensusType, type HardforkManager } from '@ts-ethereum/chain-config'
import { z, zBigInt } from '@ts-ethereum/schema'
import {
  type BigIntLike,
  EthereumJSErrorWithoutCode,
  type Withdrawal,
} from '@ts-ethereum/utils'
import type { BlockHeaderManager } from '../../header-functional'
import {
  type BlockConstructorInput,
  MAX_UNCLE_HEADERS,
  type ValidatedBlockData,
  zUncleHeadersSchema,
  zWithdrawalsSchema,
} from './schema'

/**
 * Options for block constructor validation
 */
export interface BlockValidatorOptions {
  hardforkManager: HardforkManager
  number: BigIntLike
  timestamp?: BigIntLike
}

/**
 * Creates a dynamic block validation schema based on EIP activations
 * and consensus type from GlobalConfig
 */
export function createBlockConstructorSchema(opts: BlockValidatorOptions) {
  const { hardforkManager: common } = opts
  const consensusType = common.config.spec.chain.consensus.type
  const blockNumber = zBigInt().parse(opts.number ?? 0)
  const timestamp =
    opts.timestamp !== undefined ? zBigInt().parse(opts.timestamp) : undefined
  const blockContext = { blockNumber, timestamp }
  const isEIP4895Active = common.isEIPActiveAtBlock(4895, blockContext)

  return z
    .object({
      uncleHeaders: zUncleHeadersSchema,
      withdrawals: zWithdrawalsSchema,
      isGenesis: z.boolean().optional().default(false),
    })
    .superRefine((data, ctx) => {
      const { uncleHeaders, withdrawals, isGenesis } = data

      // Skip uncle validation for genesis blocks
      if (!isGenesis && uncleHeaders.length > 0) {
        // PoA networks cannot have uncle headers
        if (consensusType === ConsensusType.ProofOfAuthority) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Block initialization with uncleHeaders on a PoA network is not allowed',
            path: ['uncleHeaders'],
          })
        }

        // PoS networks cannot have uncle headers
        if (consensusType === ConsensusType.ProofOfStake) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Block initialization with uncleHeaders on a PoS network is not allowed',
            path: ['uncleHeaders'],
          })
        }
      }

      // EIP-4895: Withdrawals validation
      if (!isEIP4895Active && withdrawals !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Cannot have a withdrawals field if EIP 4895 is not active',
          path: ['withdrawals'],
        })
      }
    })
}

/**
 * Validates block constructor inputs and returns typed validated data
 *
 * @param input - The block constructor input data to validate
 * @param opts - Validation options including GlobalConfig
 * @returns Validated block data
 * @throws EthereumJSErrorWithoutCode if validation fails
 */
export function validateBlockConstructor(
  input: BlockConstructorInput,
  opts: BlockValidatorOptions,
  number: BigIntLike,
): ValidatedBlockData {
  const blockNumber = zBigInt().parse(number ?? 0)
  const schema = createBlockConstructorSchema(opts)
  const result = schema.safeParse(input)

  if (!result.success) {
    // Format error message
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      .join('; ')
    throw EthereumJSErrorWithoutCode(errors)
  }

  const { uncleHeaders, withdrawals } = result.data

  // Apply default withdrawals for EIP-4895 if not provided
  const timestamp =
    opts.timestamp !== undefined ? zBigInt().parse(opts.timestamp) : undefined
  const blockContext = { blockNumber, timestamp }
  const finalWithdrawals =
    withdrawals ??
    (opts.hardforkManager.isEIPActiveAtBlock(4895, blockContext)
      ? []
      : undefined)

  return {
    uncleHeaders,
    withdrawals: finalWithdrawals,
  }
}

/**
 * Validates uncle headers array (standalone validation)
 * Can be used for runtime validation outside of constructor
 *
 * @param uncleHeaders - Array of uncle headers to validate
 * @returns true if valid
 * @throws EthereumJSErrorWithoutCode if validation fails
 */
export function validateUncleHeaders(
  uncleHeaders: BlockHeaderManager[],
): boolean {
  // Check max uncle count
  if (uncleHeaders.length > MAX_UNCLE_HEADERS) {
    throw EthereumJSErrorWithoutCode('too many uncle headers')
  }

  // Check for duplicate uncles by hash
  if (uncleHeaders.length > 1) {
    const hashes = new Set<string>()
    for (const uncle of uncleHeaders) {
      const hashHex = Buffer.from(uncle.hash()).toString('hex')
      if (hashes.has(hashHex)) {
        throw EthereumJSErrorWithoutCode('duplicate uncles')
      }
      hashes.add(hashHex)
    }
  }

  return true
}

/**
 * Validates withdrawals for EIP-4895 compliance
 *
 * @param withdrawals - Array of withdrawals or undefined
 * @param hardforkManager - HardforkManager for EIP check
 * @param blockNumber - Block number to check EIP activation
 * @returns Validated withdrawals (defaulting to empty array if EIP-4895 is active)
 */
export function validateWithdrawals(
  withdrawals: Withdrawal[] | undefined,
  hardforkManager: HardforkManager,
  blockNumber: bigint,
): Withdrawal[] | undefined {
  const isEIP4895Active = hardforkManager.isEIPActiveAtBlock(4895, {
    blockNumber,
  })

  if (!isEIP4895Active && withdrawals !== undefined) {
    throw EthereumJSErrorWithoutCode(
      'Cannot have a withdrawals field if EIP 4895 is not active',
    )
  }

  return withdrawals ?? (isEIP4895Active ? [] : undefined)
}
