import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase'

import type { Nibbles, RawExtensionMPTNode } from '../types'

export class ExtensionMPTNode extends ExtensionOrLeafMPTNodeBase {
  constructor(nibbles: Nibbles, value: Uint8Array) {
    super(nibbles, value, false)
  }

  override raw(): RawExtensionMPTNode {
    return super.raw()
  }
}
