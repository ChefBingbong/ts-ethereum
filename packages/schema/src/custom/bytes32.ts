import { z } from 'zod'
import { zFlexibleType } from './base'
import { TypeOutput } from './types'

export const zUint8Array32 = z
  .instanceof(Uint8Array)
  .refine((val) => val.length === 32, {
    message: 'Uint8Array must be exactly 32 bytes',
  })

export const zBytes32 = (
  options: { defaultValue?: Uint8Array; errorMessage?: string } = {},
) =>
  zFlexibleType({
    outputType: TypeOutput.Uint8Array,
    byteLength: 32,
    defaultValue: options.defaultValue ?? new Uint8Array(32),
    errorMessage: options.errorMessage,
  })

export const zBytes = (
  byteLength: number,
  defaultValue: Uint8Array,
  errorMessage?: string,
) =>
  zFlexibleType({
    outputType: TypeOutput.Uint8Array,
    byteLength,
    defaultValue,
    errorMessage,
  })

export const zBytesVar = (defaultValue: Uint8Array) =>
  zFlexibleType({
    outputType: TypeOutput.Uint8Array,
    defaultValue,
  })
