import { z } from '@ts-ethereum/schema'
import type { Withdrawal } from '@ts-ethereum/utils'
import type { BlockHeaderManager } from '../../header-functional'

/**
 * Maximum number of uncle headers allowed per block
 */
export const MAX_UNCLE_HEADERS = 2

/**
 * Schema for validating uncle headers array
 * - Maximum of 2 uncle headers
 * - No duplicate uncle hashes
 */
export const zUncleHeadersSchema = z
  .array(
    z.custom<BlockHeaderManager>((val) => val !== null && val !== undefined),
  )
  .default([])
  .superRefine((uncles, ctx) => {
    // Check max uncle count
    if (uncles.length > MAX_UNCLE_HEADERS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `too many uncle headers: got ${uncles.length}, max ${MAX_UNCLE_HEADERS}`,
      })
    }

    // Check for duplicate uncles by hash
    if (uncles.length > 1) {
      const hashes = new Set<string>()
      for (const uncle of uncles) {
        try {
          const hashHex = Buffer.from(uncle.hash()).toString('hex')
          if (hashes.has(hashHex)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'duplicate uncles',
            })
            break
          }
          hashes.add(hashHex)
        } catch {
          // If hash() fails, skip duplicate check for this uncle
        }
      }
    }
  })

/**
 * Schema for validating withdrawals array
 */
export const zWithdrawalsSchema = z
  .array(z.custom<Withdrawal>((val) => val !== null && val !== undefined))
  .optional()

/**
 * Input types for block constructor validation
 */
export interface BlockConstructorInput {
  uncleHeaders?: BlockHeaderManager[]
  withdrawals?: Withdrawal[]
  isGenesis?: boolean
}

/**
 * Validated output types from block constructor validation
 */
export interface ValidatedBlockData {
  uncleHeaders: BlockHeaderManager[]
  withdrawals: Withdrawal[] | undefined
}

export type { BlockHeaderManager, Withdrawal }
