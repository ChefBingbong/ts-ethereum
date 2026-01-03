import { zFlexibleType } from './base'
import { TypeOutput } from './types'

export const zSafeNumber = (
  options: { defaultValue?: number; errorMessage?: string } = {},
) =>
  zFlexibleType({
    outputType: TypeOutput.Number,
    defaultValue: options.defaultValue ?? 0,
    errorMessage: options.errorMessage,
  })
