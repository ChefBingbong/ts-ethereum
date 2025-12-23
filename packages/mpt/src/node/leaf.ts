import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase'

import type { Nibbles, RawLeafMPTNode } from '../types'

export class LeafMPTNode extends ExtensionOrLeafMPTNodeBase {
  constructor(nibbles: Nibbles, value: Uint8Array) {
    super(nibbles, value, true)
  }

  override raw(): RawLeafMPTNode {
    return super.raw()
  }
}
