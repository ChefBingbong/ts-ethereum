import {
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  intToBytes,
} from '@ts-ethereum/utils'
import { type Hex, hexToBytes } from 'viem'
import { z } from 'zod'
import {
  type FlexibleTypeInput,
  type FlexibleTypeOptions,
  TypeOutput,
  type TypeOutputEnum,
  type TypeOutputReturnType,
} from './types'

export function zFlexibleType<
  T extends TypeOutputEnum = typeof TypeOutput.Uint8Array,
>(options: FlexibleTypeOptions<T> = {}) {
  const {
    outputType = TypeOutput.Uint8Array as T,
    errorMessage,
    defaultValue,
    byteLength,
  } = options

  const baseSchema = z.custom<FlexibleTypeInput>(
    (val) => {
      if (val === null || val === undefined) {
        return defaultValue !== undefined
      }
      if (val instanceof Uint8Array) return true
      if (typeof val === 'bigint') return true
      if (typeof val === 'number') return Number.isSafeInteger(val)
      if (typeof val === 'string') return /^(0x)?[a-fA-F0-9]*$/.test(val)
      return false
    },
    {
      message:
        errorMessage ||
        'Invalid input: must be Uint8Array, bigint, number, or hex string',
    },
  )

  const toBytes = (val: FlexibleTypeInput): Uint8Array => {
    if (val === null || val === undefined) {
      if (defaultValue !== undefined) {
        // Convert default value to bytes based on its type
        if (defaultValue instanceof Uint8Array) return defaultValue
        if (typeof defaultValue === 'bigint') return bigIntToBytes(defaultValue)
        if (typeof defaultValue === 'number') return intToBytes(defaultValue)
        if (typeof defaultValue === 'string') {
          const hex = defaultValue.startsWith('0x')
            ? defaultValue
            : `0x${defaultValue}`
          return hexToBytes(hex as Hex)
        }
      }
      return new Uint8Array(0)
    }
    if (val instanceof Uint8Array) return val
    if (typeof val === 'bigint') return bigIntToBytes(val)
    if (typeof val === 'number') return intToBytes(val)
    if (typeof val === 'string') {
      const hex = val.startsWith('0x') ? val : `0x${val}`
      return hexToBytes(hex as Hex)
    }
    throw new Error('Unexpected input type')
  }

  // Convert bytes to final output type
  const convertOutput = (bytes: Uint8Array): TypeOutputReturnType[T] => {
    switch (outputType) {
      case TypeOutput.Uint8Array:
        return bytes as TypeOutputReturnType[T]
      case TypeOutput.BigInt:
        return bytesToBigInt(bytes) as TypeOutputReturnType[T]
      case TypeOutput.Number: {
        const bigInt = bytesToBigInt(bytes)
        if (bigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(
            errorMessage ||
              'Value exceeds MAX_SAFE_INTEGER, use BigInt or Uint8Array output instead',
          )
        }
        return Number(bigInt) as TypeOutputReturnType[T]
      }
      case TypeOutput.PrefixedHexString:
        return bytesToHex(bytes) as TypeOutputReturnType[T]
      default:
        throw new Error('Unknown output type')
    }
  }

  return baseSchema.transform((val) => {
    const bytes = toBytes(val)

    if (
      byteLength !== undefined &&
      bytes.length !== byteLength &&
      bytes.length > 0
    ) {
      throw new Error(
        errorMessage || `Expected ${byteLength} bytes, got ${bytes.length}`,
      )
    }

    return convertOutput(bytes)
  })
}
