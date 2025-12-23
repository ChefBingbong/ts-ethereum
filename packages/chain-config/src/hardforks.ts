import type { HardforksDict } from './types'

// Only Chainstart hardfork - original Frontier behavior
export const hardforksDict: HardforksDict = {
  /**
   * Description: Start of the Ethereum main chain
   * URL        : -
   * Status     : Final
   */
  chainstart: {
    eips: [1],
  },
}
