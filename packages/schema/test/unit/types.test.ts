import { TypeOutput, hexToBytes, toType } from '@ts-ethereum/utils'
import { describe, expect, it } from 'vitest'
import {
  TypeOutput as ZodTypeOutput,
  zBigInt,
  zBytes32,
  zFlexibleType,
  zHex32,
  zHexString32,
  zSafeNumber,
  zUint8Array32,
} from '../../src'

// Test data
const testHex32 =
  '0xb8a6ba8f2d6c13be07a0580add9d9ccc8e4301bd1244e3b0da53d025ce926370'
const testBytes32 = hexToBytes(testHex32)
const testHexShort = '0xff'
const testBytesShort = hexToBytes(testHexShort)
const testBigInt = BigInt(255)
const testNumber = 255

// ============================================================================
// zBytes32 Tests - 32-byte Uint8Array output
// ============================================================================

describe('zBytes32: Uint8Array(32) output schema', () => {
  it('should parse Uint8Array(32) input', () => {
    const schema = zBytes32({})
    const result = schema.safeParse(testBytes32)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(testBytes32)
      expect(result.data).toEqual(toType(testBytes32, TypeOutput.Uint8Array))
    }
  })

  it('should parse hex string (64 chars) input', () => {
    const schema = zBytes32({})
    const result = schema.safeParse(testHex32)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(testBytes32)
      expect(result.data).toEqual(toType(testHex32, TypeOutput.Uint8Array))
    }
  })

  it('should return default value for undefined input', () => {
    const defaultValue = new Uint8Array(32).fill(0xab)
    const schema = zBytes32({ defaultValue })
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(defaultValue)
    }
  })

  it('should return default value for null input', () => {
    const defaultValue = new Uint8Array(32).fill(0xcd)
    const schema = zBytes32({ defaultValue })
    const result = schema.safeParse(null)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(defaultValue)
    }
  })

  it('should return zero-filled Uint8Array(32) when no default specified', () => {
    const schema = zBytes32({})
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(new Uint8Array(32))
      expect(result.data.length).toBe(32)
    }
  })

  it('should use custom error message', () => {
    const schema = zBytes32({ errorMessage: 'Custom error for parentHash' })
    const result = schema.safeParse('invalid')

    expect(result.success).toBe(false)
  })
})

// ============================================================================
// zHex32 Tests - 32-byte hex string output
// ============================================================================

describe('zHex32: PrefixedHexString(32 bytes) output schema', () => {
  it('should parse Uint8Array(32) and output hex string', () => {
    const schema = zHex32({})
    const result = schema.safeParse(testBytes32)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testHex32)
      expect(result.data).toEqual(
        toType(testBytes32, TypeOutput.PrefixedHexString),
      )
    }
  })

  it('should parse hex string input and normalize', () => {
    const schema = zHex32({})
    const result = schema.safeParse(testHex32)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testHex32)
    }
  })

  it('should return default hex value for undefined input', () => {
    const defaultHex =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`
    const schema = zHex32({ defaultValue: defaultHex })
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(defaultHex)
    }
  })
})

// ============================================================================
// zBigInt Tests - BigInt output
// ============================================================================

describe('zBigInt: BigInt output schema', () => {
  it('should parse Uint8Array input and output BigInt', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(testBytesShort)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testBigInt)
      expect(result.data).toEqual(toType(testBytesShort, TypeOutput.BigInt))
    }
  })

  it('should parse hex string input and output BigInt', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(testHexShort)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testBigInt)
      expect(result.data).toEqual(toType(testHexShort, TypeOutput.BigInt))
    }
  })

  it('should parse BigInt input and output BigInt', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(testBigInt)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testBigInt)
    }
  })

  it('should parse number input and output BigInt', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(testNumber)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testBigInt)
      expect(result.data).toEqual(toType(testNumber, TypeOutput.BigInt))
    }
  })

  it('should return default BigInt for undefined input', () => {
    const defaultValue = BigInt(21000)
    const schema = zBigInt({ defaultValue })
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(defaultValue)
    }
  })

  it('should return 0n when no default specified', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(BigInt(0))
    }
  })
})

// ============================================================================
// zSafeNumber Tests - Number output
// ============================================================================

describe('zSafeNumber: Number output schema', () => {
  it('should parse Uint8Array input and output Number', () => {
    const schema = zSafeNumber({})
    const result = schema.safeParse(testBytesShort)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testNumber)
      expect(result.data).toEqual(toType(testBytesShort, TypeOutput.Number))
    }
  })

  it('should parse hex string input and output Number', () => {
    const schema = zSafeNumber({})
    const result = schema.safeParse(testHexShort)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testNumber)
      expect(result.data).toEqual(toType(testHexShort, TypeOutput.Number))
    }
  })

  it('should parse BigInt input and output Number', () => {
    const schema = zSafeNumber({})
    const result = schema.safeParse(testBigInt)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testNumber)
    }
  })

  it('should parse number input and output Number', () => {
    const schema = zSafeNumber({})
    const result = schema.safeParse(testNumber)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testNumber)
    }
  })

  it('should return default number for undefined input', () => {
    const defaultValue = 21000
    const schema = zSafeNumber({ defaultValue })
    const result = schema.safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(defaultValue)
    }
  })

  it('should throw for values exceeding MAX_SAFE_INTEGER', () => {
    const schema = zSafeNumber({})
    const largeHex = '0x' + 'ff'.repeat(8) // 8 bytes = exceeds MAX_SAFE_INTEGER

    // Error is thrown during transform, so we catch it directly
    expect(() => schema.parse(largeHex)).toThrow(
      'Value exceeds MAX_SAFE_INTEGER',
    )
  })
})

// ============================================================================
// zFlexibleType Tests - Generic flexible type conversion
// ============================================================================

describe('zFlexibleType: Generic flexible type schema', () => {
  describe('Output: Uint8Array', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.Uint8Array,
      defaultValue: new Uint8Array([0]),
    })

    it('should convert hex string to Uint8Array', () => {
      const result = schema.safeParse(testHexShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(toType(testHexShort, TypeOutput.Uint8Array))
      }
    })

    it('should convert BigInt to Uint8Array', () => {
      const result = schema.safeParse(testBigInt)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeInstanceOf(Uint8Array)
      }
    })

    it('should convert number to Uint8Array', () => {
      const result = schema.safeParse(testNumber)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeInstanceOf(Uint8Array)
      }
    })

    it('should pass through Uint8Array', () => {
      const result = schema.safeParse(testBytesShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(testBytesShort)
      }
    })
  })

  describe('Output: BigInt', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.BigInt,
      defaultValue: BigInt(0),
    })

    it('should convert hex string to BigInt', () => {
      const result = schema.safeParse(testHexShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(toType(testHexShort, TypeOutput.BigInt))
      }
    })

    it('should convert Uint8Array to BigInt', () => {
      const result = schema.safeParse(testBytesShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(toType(testBytesShort, TypeOutput.BigInt))
      }
    })

    it('should convert number to BigInt', () => {
      const result = schema.safeParse(testNumber)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(BigInt(testNumber))
      }
    })

    it('should pass through BigInt', () => {
      const result = schema.safeParse(testBigInt)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(testBigInt)
      }
    })
  })

  describe('Output: PrefixedHexString', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.PrefixedHexString,
      defaultValue: '0x00' as `0x${string}`,
    })

    it('should convert Uint8Array to hex string', () => {
      const result = schema.safeParse(testBytesShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(
          toType(testBytesShort, TypeOutput.PrefixedHexString),
        )
      }
    })

    it('should convert BigInt to hex string', () => {
      const result = schema.safeParse(testBigInt)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data.startsWith('0x')).toBe(true)
      }
    })

    it('should convert number to hex string', () => {
      const result = schema.safeParse(testNumber)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data.startsWith('0x')).toBe(true)
      }
    })

    it('should normalize hex string', () => {
      const result = schema.safeParse('ff') // without 0x prefix
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('0xff')
      }
    })
  })

  describe('Output: Number', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.Number,
      defaultValue: 0,
    })

    it('should convert hex string to number', () => {
      const result = schema.safeParse(testHexShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(toType(testHexShort, TypeOutput.Number))
      }
    })

    it('should convert Uint8Array to number', () => {
      const result = schema.safeParse(testBytesShort)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(toType(testBytesShort, TypeOutput.Number))
      }
    })

    it('should convert BigInt to number', () => {
      const result = schema.safeParse(testBigInt)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(testNumber)
      }
    })

    it('should pass through number', () => {
      const result = schema.safeParse(testNumber)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(testNumber)
      }
    })
  })
})
// ============================================================================
// Individual type schemas tests
// ============================================================================

describe('zUint8Array32: Exact 32-byte Uint8Array', () => {
  it('should accept Uint8Array(32)', () => {
    const result = zUint8Array32.safeParse(testBytes32)
    expect(result.success).toBe(true)
  })

  it('should reject Uint8Array with wrong length', () => {
    const wrongLength = new Uint8Array(31)
    const result = zUint8Array32.safeParse(wrongLength)
    expect(result.success).toBe(false)
  })

  it('should reject non-Uint8Array', () => {
    const result = zUint8Array32.safeParse(testHex32)
    expect(result.success).toBe(false)
  })
})

describe('zHexString32: Exact 64-char hex string', () => {
  it('should accept valid 64-char hex string with 0x prefix', () => {
    const result = zHexString32.safeParse(testHex32)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testHex32)
    }
  })

  it('should accept valid 64-char hex string without 0x prefix', () => {
    const withoutPrefix = testHex32.slice(2)
    const result = zHexString32.safeParse(withoutPrefix)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(testHex32) // should add 0x prefix
    }
  })

  it('should reject hex string with wrong length', () => {
    const wrongLength = '0x' + 'ab'.repeat(31)
    const result = zHexString32.safeParse(wrongLength)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Comparison with toType - comprehensive matrix
// ============================================================================

describe('Comparison with toType: All input/output combinations', () => {
  const testCases = [
    { name: 'small number', value: 42, bytes: new Uint8Array([42]) },
    { name: 'medium number', value: 256, bytes: new Uint8Array([1, 0]) },
    {
      name: 'hex string ff',
      value: '0xff',
      bytes: new Uint8Array([255]),
      bigInt: BigInt(255),
      number: 255,
    },
    {
      name: 'hex string 0100',
      value: '0x0100',
      bytes: new Uint8Array([1, 0]),
      bigInt: BigInt(256),
      number: 256,
    },
  ]

  for (const tc of testCases) {
    describe(`Input: ${tc.name} (${typeof tc.value === 'string' ? tc.value : tc.value})`, () => {
      it('zFlexibleType -> Uint8Array matches toType', () => {
        const schema = zFlexibleType({
          outputType: ZodTypeOutput.Uint8Array,
          defaultValue: new Uint8Array([0]),
        })
        const zodResult = schema.safeParse(tc.value)
        const toTypeResult = toType(tc.value as any, TypeOutput.Uint8Array)

        expect(zodResult.success).toBe(true)
        if (zodResult.success) {
          expect(zodResult.data).toEqual(toTypeResult)
        }
      })

      it('zFlexibleType -> BigInt matches toType', () => {
        const schema = zFlexibleType({
          outputType: ZodTypeOutput.BigInt,
          defaultValue: BigInt(0),
        })
        const zodResult = schema.safeParse(tc.value)
        const toTypeResult = toType(tc.value as any, TypeOutput.BigInt)

        expect(zodResult.success).toBe(true)
        if (zodResult.success) {
          expect(zodResult.data).toEqual(toTypeResult)
        }
      })

      it('zFlexibleType -> Number matches toType', () => {
        const schema = zFlexibleType({
          outputType: ZodTypeOutput.Number,
          defaultValue: 0,
        })
        const zodResult = schema.safeParse(tc.value)
        const toTypeResult = toType(tc.value as any, TypeOutput.Number)

        expect(zodResult.success).toBe(true)
        if (zodResult.success) {
          expect(zodResult.data).toEqual(toTypeResult)
        }
      })

      it('zFlexibleType -> PrefixedHexString matches toType', () => {
        const schema = zFlexibleType({
          outputType: ZodTypeOutput.PrefixedHexString,
          defaultValue: '0x00' as `0x${string}`,
        })
        const zodResult = schema.safeParse(tc.value)
        const toTypeResult = toType(
          tc.value as any,
          TypeOutput.PrefixedHexString,
        )

        expect(zodResult.success).toBe(true)
        if (zodResult.success) {
          expect(zodResult.data).toEqual(toTypeResult)
        }
      })
    })
  }
})

// ============================================================================
// Edge cases and error handling
// ============================================================================

describe('Edge cases and error handling', () => {
  it('should handle zero value', () => {
    const schema = zBigInt({})
    const result = schema.safeParse(0)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(BigInt(0))
    }
  })

  it('should handle empty hex string', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.Uint8Array,
      defaultValue: new Uint8Array([0]),
    })
    const result = schema.safeParse('0x')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(new Uint8Array(0))
    }
  })

  it('should reject unsafe integers for number input', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.Uint8Array,
      defaultValue: new Uint8Array([0]),
    })
    const unsafeInt = Number.MAX_SAFE_INTEGER + 1
    const result = schema.safeParse(unsafeInt)

    expect(result.success).toBe(false)
  })

  it('should reject invalid hex characters', () => {
    const schema = zFlexibleType({
      outputType: ZodTypeOutput.Uint8Array,
      defaultValue: new Uint8Array([0]),
    })
    const result = schema.safeParse('0xgg')

    expect(result.success).toBe(false)
  })

  it('should reject objects', () => {
    const schema = zBigInt({})
    const result = schema.safeParse({ value: 123 })

    expect(result.success).toBe(false)
  })

  it('should reject arrays', () => {
    const schema = zBigInt({})
    const result = schema.safeParse([1, 2, 3])

    expect(result.success).toBe(false)
  })
})
