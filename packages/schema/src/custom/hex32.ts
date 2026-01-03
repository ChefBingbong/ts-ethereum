import type { Hex } from 'viem'
import { z } from 'zod'
import { zFlexibleType } from './base'
import { TypeOutput } from './types'

export const zHexString32 = z
  .string()
  .regex(
    /^(0x)?[a-fA-F0-9]{64}$/,
    'Must be a 64-character hex string (32 bytes)',
  )
  .transform(
    (val): Hex => (val.startsWith('0x') ? (val as Hex) : (`0x${val}` as Hex)),
  )
export const zHex32 = (
  options: { defaultValue?: Hex; errorMessage?: string } = {},
) =>
  zFlexibleType({
    outputType: TypeOutput.PrefixedHexString,
    byteLength: 32,
    defaultValue: options.defaultValue ?? (('0x' + '00'.repeat(32)) as Hex),
    errorMessage: options.errorMessage,
  })
