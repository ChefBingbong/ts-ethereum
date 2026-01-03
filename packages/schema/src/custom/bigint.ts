import { zFlexibleType } from './base'
import { TypeOutput } from './types'

export const zBigInt = (
  options: { defaultValue?: bigint; errorMessage?: string } = {},
) =>
  zFlexibleType({
    outputType: TypeOutput.BigInt,
    defaultValue: options.defaultValue ?? BigInt(0),
    errorMessage: options.errorMessage,
  })
