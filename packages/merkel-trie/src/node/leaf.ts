import type { Nibbles, RawLeafMPTNode } from '../types'
import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase'

export class LeafMPTNode extends ExtensionOrLeafMPTNodeBase {
  constructor(nibbles: Nibbles, value: Uint8Array) {
    super(nibbles, value, true)
  }

  raw(): RawLeafMPTNode {
    return super.raw()
  }
}
