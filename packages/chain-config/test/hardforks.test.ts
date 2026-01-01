import { describe, expect, it } from 'vitest'
import {
  EIP,
  getActiveEIPsAtHardfork,
  getHardforkIndex,
  getHardforkSequence,
  Hardfork,
  HARDFORK_EIPS,
  HARDFORK_ORDER,
} from '../src/hardforks'

describe('hardforks', () => {
  describe('HARDFORK_ORDER', () => {
    it('should start with chainstart', () => {
      expect(HARDFORK_ORDER[0]).toBe('chainstart')
    })

    it('should have homestead after chainstart', () => {
      expect(HARDFORK_ORDER[1]).toBe('homestead')
    })

    it('should include all major hardforks in correct order', () => {
      const majorForks = [
        'chainstart',
        'homestead',
        'byzantium',
        'constantinople',
        'istanbul',
        'berlin',
        'london',
        'paris',
        'shanghai',
        'cancun',
        'prague',
      ]

      let lastIndex = -1
      for (const fork of majorForks) {
        const currentIndex = HARDFORK_ORDER.indexOf(fork as any)
        expect(currentIndex).toBeGreaterThan(lastIndex)
        lastIndex = currentIndex
      }
    })

    it('should have paris before shanghai (merge before withdrawals)', () => {
      const parisIndex = HARDFORK_ORDER.indexOf('paris')
      const shanghaiIndex = HARDFORK_ORDER.indexOf('shanghai')
      expect(parisIndex).toBeLessThan(shanghaiIndex)
    })
  })

  describe('Hardfork enum', () => {
    it('should map to correct string values', () => {
      expect(Hardfork.Chainstart).toBe('chainstart')
      expect(Hardfork.Homestead).toBe('homestead')
      expect(Hardfork.London).toBe('london')
      expect(Hardfork.Paris).toBe('paris')
      expect(Hardfork.Shanghai).toBe('shanghai')
      expect(Hardfork.Cancun).toBe('cancun')
      expect(Hardfork.Prague).toBe('prague')
    })
  })

  describe('HARDFORK_EIPS', () => {
    it('should have EIP-1 in chainstart', () => {
      expect(HARDFORK_EIPS.chainstart).toContain(EIP.EIP_1)
    })

    it('should have EIP-1559 in london', () => {
      expect(HARDFORK_EIPS.london).toContain(EIP.EIP_1559)
    })

    it('should have EIP-4844 in cancun', () => {
      expect(HARDFORK_EIPS.cancun).toContain(EIP.EIP_4844)
    })

    it('should have EIP-2929 and EIP-2930 in berlin', () => {
      expect(HARDFORK_EIPS.berlin).toContain(EIP.EIP_2929)
      expect(HARDFORK_EIPS.berlin).toContain(EIP.EIP_2930)
    })

    it('should have empty array for dao hardfork', () => {
      expect(HARDFORK_EIPS.dao).toHaveLength(0)
    })
  })

  describe('getHardforkIndex', () => {
    it('should return 0 for chainstart', () => {
      expect(getHardforkIndex(Hardfork.Chainstart)).toBe(0)
    })

    it('should return 1 for homestead', () => {
      expect(getHardforkIndex(Hardfork.Homestead)).toBe(1)
    })

    it('should return correct index for london', () => {
      const index = getHardforkIndex(Hardfork.London)
      expect(HARDFORK_ORDER[index]).toBe('london')
    })
  })

  describe('getHardforkSequence', () => {
    it('should return only chainstart for chainstart', () => {
      const sequence = getHardforkSequence(Hardfork.Chainstart)
      expect(sequence).toEqual(['chainstart'])
    })

    it('should return chainstart and homestead for homestead', () => {
      const sequence = getHardforkSequence(Hardfork.Homestead)
      expect(sequence).toEqual(['chainstart', 'homestead'])
    })

    it('should include all hardforks up to berlin', () => {
      const sequence = getHardforkSequence(Hardfork.Berlin)
      expect(sequence).toContain('chainstart')
      expect(sequence).toContain('homestead')
      expect(sequence).toContain('byzantium')
      expect(sequence).toContain('istanbul')
      expect(sequence).toContain('berlin')
      expect(sequence).not.toContain('london')
    })

    it('should include london in london sequence', () => {
      const sequence = getHardforkSequence(Hardfork.London)
      expect(sequence).toContain('london')
      expect(sequence).not.toContain('paris')
    })
  })

  describe('getActiveEIPsAtHardfork', () => {
    it('should return only EIP-1 for chainstart', () => {
      const eips = getActiveEIPsAtHardfork(Hardfork.Chainstart)
      expect(eips.has(EIP.EIP_1)).toBe(true)
      expect(eips.size).toBe(1)
    })

    it('should include EIP-1 at all hardforks', () => {
      const hardforks = [
        Hardfork.Homestead,
        Hardfork.Berlin,
        Hardfork.London,
        Hardfork.Paris,
        Hardfork.Cancun,
      ]

      for (const hf of hardforks) {
        const eips = getActiveEIPsAtHardfork(hf)
        expect(eips.has(EIP.EIP_1)).toBe(true)
      }
    })

    it('should have EIP-1559 active at london but not at berlin', () => {
      const berlinEips = getActiveEIPsAtHardfork(Hardfork.Berlin)
      const londonEips = getActiveEIPsAtHardfork(Hardfork.London)

      expect(berlinEips.has(EIP.EIP_1559)).toBe(false)
      expect(londonEips.has(EIP.EIP_1559)).toBe(true)
    })

    it('should accumulate EIPs across hardforks', () => {
      const berlinEips = getActiveEIPsAtHardfork(Hardfork.Berlin)
      const londonEips = getActiveEIPsAtHardfork(Hardfork.London)

      // London should have all Berlin EIPs plus its own
      for (const eip of berlinEips) {
        expect(londonEips.has(eip)).toBe(true)
      }
      expect(londonEips.size).toBeGreaterThan(berlinEips.size)
    })

    it('should have EIP-4844 active at cancun but not at shanghai', () => {
      const shanghaiEips = getActiveEIPsAtHardfork(Hardfork.Shanghai)
      const cancunEips = getActiveEIPsAtHardfork(Hardfork.Cancun)

      expect(shanghaiEips.has(EIP.EIP_4844)).toBe(false)
      expect(cancunEips.has(EIP.EIP_4844)).toBe(true)
    })
  })
})
