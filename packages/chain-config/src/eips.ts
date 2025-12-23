import { Hardfork } from './index'

import type { EIPsDict } from './types'

// Only Frontier/Chainstart - no other EIPs
export const eipsDict: EIPsDict = {
  /**
   * Frontier/Chainstart
   * (there is no Meta-EIP currently for Frontier, so 1 was chosen)
   */
  1: {
    minimumHardfork: Hardfork.Chainstart,
  },
}
