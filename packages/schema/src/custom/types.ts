import type { Hex } from 'viem'

export const TypeOutput = {
  Number: 0,
  BigInt: 1,
  Uint8Array: 2,
  PrefixedHexString: 3,
} as const

export type TypeOutputEnum = (typeof TypeOutput)[keyof typeof TypeOutput]

export type TypeOutputReturnType = {
  [TypeOutput.Number]: number
  [TypeOutput.BigInt]: bigint
  [TypeOutput.Uint8Array]: Uint8Array
  [TypeOutput.PrefixedHexString]: Hex
}

export type FlexibleTypeInput =
  | Uint8Array
  | bigint
  | number
  | string
  | null
  | undefined

export interface FlexibleTypeOptions<T extends TypeOutputEnum> {
  outputType?: T
  errorMessage?: string
  defaultValue?: TypeOutputReturnType[T]
  byteLength?: number
}
