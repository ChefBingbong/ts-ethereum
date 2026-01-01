import { describe, expect, it } from 'vitest'
import { ParamsManager } from '../../src/config/param-manager'
import { EIP, Hardfork } from '../../src/hardforks'

describe('ParamsManager', () => {
  describe('constructor', () => {
    it('should create a manager at chainstart', () => {
      const manager = new ParamsManager(Hardfork.Chainstart)
      expect(manager.currentHardfork).toBe(Hardfork.Chainstart)
    })

    it('should create a manager at london', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.currentHardfork).toBe(Hardfork.London)
    })
  })

  describe('activeEips', () => {
    it('should have only EIP-1 active at chainstart', () => {
      const manager = new ParamsManager(Hardfork.Chainstart)
      const eips = manager.activeEips
      expect(eips.has(EIP.EIP_1)).toBe(true)
      expect(eips.size).toBe(1)
    })

    it('should have EIP-1559 active at london', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.activeEips.has(EIP.EIP_1559)).toBe(true)
    })

    it('should not have EIP-1559 active at berlin', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.activeEips.has(EIP.EIP_1559)).toBe(false)
    })

    it('should return a copy of the active EIPs set', () => {
      const manager = new ParamsManager(Hardfork.London)
      const eips1 = manager.activeEips
      const eips2 = manager.activeEips
      expect(eips1).not.toBe(eips2)
      expect(eips1).toEqual(eips2)
    })
  })

  describe('isEIPActive', () => {
    it('should return true for EIP-1 at any hardfork', () => {
      const manager = new ParamsManager(Hardfork.Cancun)
      expect(manager.isEIPActive(EIP.EIP_1)).toBe(true)
    })

    it('should return true for EIP-1559 at london', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.isEIPActive(EIP.EIP_1559)).toBe(true)
    })

    it('should return false for EIP-1559 at berlin', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.isEIPActive(EIP.EIP_1559)).toBe(false)
    })

    it('should return true for EIP-4844 at cancun', () => {
      const manager = new ParamsManager(Hardfork.Cancun)
      expect(manager.isEIPActive(EIP.EIP_4844)).toBe(true)
    })

    it('should return false for EIP-4844 at shanghai', () => {
      const manager = new ParamsManager(Hardfork.Shanghai)
      expect(manager.isEIPActive(EIP.EIP_4844)).toBe(false)
    })
  })

  describe('getParam', () => {
    it('should return txGas of 21000', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getParam('txGas')).toBe(21000n)
    })

    it('should return base sload gas at chainstart', () => {
      const manager = new ParamsManager(Hardfork.Chainstart)
      expect(manager.getParam('sloadGas')).toBe(50n)
    })

    it('should return updated sload gas after tangerine whistle', () => {
      const manager = new ParamsManager(Hardfork.TangerineWhistle)
      expect(manager.getParam('sloadGas')).toBe(200n)
    })

    it('should return 0 for sload gas after berlin (cold/warm model)', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.getParam('sloadGas')).toBe(0n)
    })

    it('should return cold sload gas at berlin', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.getParam('coldsloadGas')).toBe(2100n)
    })

    it('should return warm storage read gas at berlin', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.getParam('warmstoragereadGas')).toBe(100n)
    })

    it('should return EIP-1559 params at london', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getParam('baseFeeMaxChangeDenominator')).toBe(8n)
      expect(manager.getParam('elasticityMultiplier')).toBe(2n)
    })

    it('should return undefined for non-existent param', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getParam('nonExistentParam' as any)).toBeUndefined()
    })
  })

  describe('getParamByEIP', () => {
    it('should return param from specific EIP', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getParamByEIP(EIP.EIP_1559, 'initialBaseFee')).toBe(
        1000000000n,
      )
    })

    it('should throw if EIP is not active', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(() =>
        manager.getParamByEIP(EIP.EIP_1559, 'initialBaseFee'),
      ).toThrow('EIP 1559 is not active at hardfork berlin')
    })
  })

  describe('updateParams', () => {
    it('should override a parameter', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getParam('txGas')).toBe(21000n)

      manager.updateParams({ txGas: 25000n })
      expect(manager.getParam('txGas')).toBe(25000n)
    })

    it('should preserve other parameters when overriding', () => {
      const manager = new ParamsManager(Hardfork.London)
      manager.updateParams({ txGas: 25000n })

      expect(manager.getParam('txCreationGas')).toBe(32000n)
      expect(manager.getParam('callGas')).toBe(0n) // after berlin
    })

    it('should allow chaining', () => {
      const manager = new ParamsManager(Hardfork.London)
      const result = manager
        .updateParams({ txGas: 25000n })
        .updateParams({ txCreationGas: 40000n })

      expect(result).toBe(manager)
      expect(manager.getParam('txGas')).toBe(25000n)
      expect(manager.getParam('txCreationGas')).toBe(40000n)
    })
  })

  describe('withHardfork', () => {
    it('should create a new manager at a different hardfork', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      const newManager = manager.withHardfork(Hardfork.London)

      expect(manager.currentHardfork).toBe(Hardfork.Berlin)
      expect(newManager.currentHardfork).toBe(Hardfork.London)
    })

    it('should preserve overrides when changing hardfork', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      manager.updateParams({ txGas: 25000n })

      const newManager = manager.withHardfork(Hardfork.London)
      expect(newManager.getParam('txGas')).toBe(25000n)
    })

    it('should not affect the original manager', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      const newManager = manager.withHardfork(Hardfork.London)

      expect(manager.isEIPActive(EIP.EIP_1559)).toBe(false)
      expect(newManager.isEIPActive(EIP.EIP_1559)).toBe(true)
    })
  })

  describe('copy', () => {
    it('should create a copy with same hardfork', () => {
      const manager = new ParamsManager(Hardfork.London)
      const copy = manager.copy()

      expect(copy.currentHardfork).toBe(manager.currentHardfork)
    })

    it('should create a copy with same overrides', () => {
      const manager = new ParamsManager(Hardfork.London)
      manager.updateParams({ txGas: 25000n })

      const copy = manager.copy()
      expect(copy.getParam('txGas')).toBe(25000n)
    })

    it('should create an independent copy', () => {
      const manager = new ParamsManager(Hardfork.London)
      const copy = manager.copy()

      manager.updateParams({ txGas: 30000n })
      expect(copy.getParam('txGas')).toBe(21000n)
    })
  })

  describe('getHardforkForEIP', () => {
    it('should return chainstart for EIP-1', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getHardforkForEIP(EIP.EIP_1)).toBe(Hardfork.Chainstart)
    })

    it('should return london for EIP-1559', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getHardforkForEIP(EIP.EIP_1559)).toBe(Hardfork.London)
    })

    it('should return cancun for EIP-4844', () => {
      const manager = new ParamsManager(Hardfork.Cancun)
      expect(manager.getHardforkForEIP(EIP.EIP_4844)).toBe(Hardfork.Cancun)
    })

    it('should return berlin for EIP-2929', () => {
      const manager = new ParamsManager(Hardfork.Berlin)
      expect(manager.getHardforkForEIP(EIP.EIP_2929)).toBe(Hardfork.Berlin)
    })

    it('should return undefined for unknown EIP', () => {
      const manager = new ParamsManager(Hardfork.London)
      expect(manager.getHardforkForEIP(99999)).toBeUndefined()
    })
  })
})
