import { Address, createZeroAddress, hexToBytes } from '@ts-ethereum/utils'
import { type Hex, isHex } from 'viem'
import { z } from 'zod'

/**
 * Input types that can be converted to an Address
 */
type AddressInput = Address | Uint8Array | string | null | undefined

/**
 * Options for the address schema
 */
interface AddressSchemaOptions {
  /** Default value when input is null/undefined */
  defaultValue?: Address
  /** Custom error message */
  errorMessage?: string
}

/**
 * Zod schema for validating and transforming AddressLike inputs to Address instances.
 *
 * Accepts:
 * - Address instances (passed through)
 * - Uint8Array of exactly 20 bytes
 * - Hex strings (0x-prefixed, 40 hex chars = 20 bytes)
 * - null/undefined (returns default value)
 *
 * @param options - Configuration options
 * @returns Zod schema that transforms input to Address
 */
export function zAddress(options: AddressSchemaOptions = {}) {
  const { defaultValue = createZeroAddress(), errorMessage } = options

  return z
    .custom<AddressInput>(
      (val) => {
        if (val === null || val === undefined) {
          return defaultValue !== undefined
        }
        if (val instanceof Address) return true
        if (val instanceof Uint8Array) return val.length === 20
        if (typeof val === 'string') {
          // Check for valid 20-byte hex string (40 hex chars + 0x prefix)
          return /^(0x)?[a-fA-F0-9]{40}$/.test(val)
        }
        return false
      },
      {
        message:
          errorMessage ||
          'Invalid address: must be Address instance, 20-byte Uint8Array, or 40-char hex string',
      },
    )
    .transform((val): Address => {
      if (val === null || val === undefined) {
        return defaultValue
      }

      if (val instanceof Address) {
        return val
      }

      if (val instanceof Uint8Array) {
        if (val.length !== 20) {
          throw new Error(
            errorMessage ||
              `Invalid address length: expected 20 bytes, got ${val.length}`,
          )
        }
        return new Address(val)
      }

      if (typeof val === 'string') {
        // Normalize hex string
        const hex = val.startsWith('0x') ? val : `0x${val}`

        // Validate length (0x + 40 hex chars)
        if (hex.length !== 42) {
          throw new Error(
            errorMessage ||
              `Invalid address length: expected 42 chars (0x + 40), got ${hex.length}`,
          )
        }

        if (!isHex(hex)) {
          throw new Error(errorMessage || 'Invalid hex string for address')
        }

        const bytes = hexToBytes(hex as Hex)
        return new Address(bytes)
      }

      throw new Error(errorMessage || 'Unexpected address input type')
    })
}

/**
 * Strict address schema that only accepts Address instances
 */
export const zAddressStrict = z.instanceof(Address)

/**
 * Address schema that accepts 20-byte Uint8Array only
 */
export const zAddressBytes = z
  .instanceof(Uint8Array)
  .refine((val) => val.length === 20, {
    message: 'Address must be exactly 20 bytes',
  })
  .transform((val) => new Address(val))

/**
 * Address schema that accepts hex string only
 */
export const zAddressHex = z
  .string()
  .regex(
    /^(0x)?[a-fA-F0-9]{40}$/,
    'Must be a 40-character hex string (20 bytes)',
  )
  .transform((val): Address => {
    const hex = val.startsWith('0x') ? val : `0x${val}`
    const bytes = hexToBytes(hex as Hex)
    return new Address(bytes)
  })
