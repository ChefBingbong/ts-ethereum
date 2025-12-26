import type { Nibbles, RawExtensionMPTNode } from '../types'
import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase'

export class ExtensionMPTNode extends ExtensionOrLeafMPTNodeBase {
  constructor(nibbles: Nibbles, value: Uint8Array) {
    super(nibbles, value, false)
  }

  raw(): RawExtensionMPTNode {
    return super.raw()
  }
}
