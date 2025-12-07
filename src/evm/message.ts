import { BIGINT_0, EthereumJSErrorWithoutCode, createZeroAddress } from '../utils'

import type { BinaryTreeAccessWitnessInterface } from '../chain-config'
import type { Address, PrefixedHexString } from '../utils'

const defaults = {
  value: BIGINT_0,
  caller: createZeroAddress(),
  data: new Uint8Array(0),
  depth: 0,
  delegatecall: false,
  gasRefund: BIGINT_0,
}

interface MessageOpts {
  to?: Address
  value?: bigint
  caller?: Address
  gasLimit: bigint
  data?: Uint8Array
  depth?: number
  delegatecall?: boolean
  gasRefund?: bigint
  accessWitness?: BinaryTreeAccessWitnessInterface
}

export class Message {
  to?: Address
  value: bigint
  caller: Address
  gasLimit: bigint
  data: Uint8Array
  depth: number
  delegatecall: boolean
  gasRefund: bigint // Keeps track of the gasRefund at the start of the frame (used for journaling purposes)
  accessWitness?: BinaryTreeAccessWitnessInterface

  constructor(opts: MessageOpts) {
    this.to = opts.to
    this.value = opts.value ?? defaults.value
    this.caller = opts.caller ?? defaults.caller
    this.gasLimit = opts.gasLimit
    this.data = opts.data ?? defaults.data
    this.depth = opts.depth ?? defaults.depth
    this.delegatecall = opts.delegatecall ?? defaults.delegatecall
    this.gasRefund = opts.gasRefund ?? defaults.gasRefund
    this.accessWitness = opts.accessWitness
    if (this.value < 0) {
      throw EthereumJSErrorWithoutCode(`value field cannot be negative, received ${this.value}`)
    }
  }
}

export type MessageWithTo = Message & Pick<Required<MessageOpts>, 'to'>
