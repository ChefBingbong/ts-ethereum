import { describe, expect, it } from 'vitest'
import { createHardforkSchema, hardforkEntry } from '../../src/chains/schema'
import { GlobalConfig } from '../../src/config/global-config'
import { EIP, Hardfork } from '../../src/hardforks'

const testSchema = createHardforkSchema({
  hardforks: [
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),
    hardforkEntry(Hardfork.Homestead, { block: 0n }),
    hardforkEntry(Hardfork.TangerineWhistle, { block: 0n }),
    hardforkEntry(Hardfork.SpuriousDragon, { block: 0n }),
    hardforkEntry(Hardfork.Byzantium, { block: 0n }),
    hardforkEntry(Hardfork.Constantinople, { block: 0n }),
    hardforkEntry(Hardfork.Petersburg, { block: 0n }),
    hardforkEntry(Hardfork.Istanbul, { block: 0n }),
    hardforkEntry(Hardfork.Berlin, { block: 100n }),
    hardforkEntry(Hardfork.London, { block: 200n }),
    hardforkEntry(Hardfork.Paris, { block: null, timestamp: '1000' }),
    hardforkEntry(Hardfork.Shanghai, { block: null, timestamp: '2000' }),
    hardforkEntry(Hardfork.Cancun, { block: null, timestamp: '3000' }),
  ] as const,
  chainId: 12345n,
})

describe('GlobalConfig', () => {
  describe('fromSchema', () => {
    it('should create a config from schema', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config).toBeInstanceOf(GlobalConfig)
    })

    it('should use first hardfork if none specified', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
      })

      expect(config.hardfork()).toBe(Hardfork.Chainstart)
    })

    it('should use specified hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.hardfork()).toBe(Hardfork.Cancun)
    })
  })

  describe('chainId', () => {
    it('should return the chain ID', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.chainId()).toBe(12345n)
    })
  })

  describe('hardfork', () => {
    it('should return current hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      expect(config.hardfork()).toBe(Hardfork.Berlin)
    })
  })

  describe('setHardfork', () => {
    it('should change the current hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      config.setHardfork(Hardfork.London)
      expect(config.hardfork()).toBe(Hardfork.London)
    })

    it('should emit hardforkChanged event', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      let emittedHardfork: string | undefined
      config.events.on('hardforkChanged', (hf) => {
        emittedHardfork = hf
      })

      config.setHardfork(Hardfork.London)
      expect(emittedHardfork).toBe(Hardfork.London)
    })

    it('should throw for invalid hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      expect(() => config.setHardfork('notAHardfork' as any)).toThrow()
    })

    it('should return the new hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      const result = config.setHardfork(Hardfork.London)
      expect(result).toBe(Hardfork.London)
    })
  })

  describe('isActivatedEIP', () => {
    it('should return true for EIP-1 at any hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.isActivatedEIP(EIP.EIP_1)).toBe(true)
    })

    it('should return true for EIP-1559 at london', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.isActivatedEIP(EIP.EIP_1559)).toBe(true)
    })

    it('should return false for EIP-1559 at berlin', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      expect(config.isActivatedEIP(EIP.EIP_1559)).toBe(false)
    })

    it('should update when hardfork changes', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      expect(config.isActivatedEIP(EIP.EIP_1559)).toBe(false)

      config.setHardfork(Hardfork.London)
      expect(config.isActivatedEIP(EIP.EIP_1559)).toBe(true)
    })
  })

  describe('getParam', () => {
    it('should return parameter values', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.getParam('txGas')).toBe(21000n)
    })

    it('should return hardfork-appropriate values', () => {
      const configBerlin = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      const configLondon = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      // EIP-1559 params only available at London+
      expect(
        configBerlin.getParam('baseFeeMaxChangeDenominator'),
      ).toBeUndefined()
      expect(configLondon.getParam('baseFeeMaxChangeDenominator')).toBe(8n)
    })
  })

  describe('updateParams', () => {
    it('should override parameters', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      config.updateParams({ txGas: 25000n })
      expect(config.getParam('txGas')).toBe(25000n)
    })

    it('should allow chaining', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      const result = config.updateParams({ txGas: 25000n })
      expect(result).toBe(config)
    })
  })

  describe('gteHardfork', () => {
    it('should return true for same hardfork', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.gteHardfork(Hardfork.London)).toBe(true)
    })

    it('should return true for earlier hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.gteHardfork(Hardfork.Berlin)).toBe(true)
      expect(config.gteHardfork(Hardfork.Istanbul)).toBe(true)
      expect(config.gteHardfork(Hardfork.Chainstart)).toBe(true)
    })

    it('should return false for later hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.gteHardfork(Hardfork.Paris)).toBe(false)
      expect(config.gteHardfork(Hardfork.Shanghai)).toBe(false)
    })
  })

  describe('hardforkBlock', () => {
    it('should return block number for block-based hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.hardforkBlock(Hardfork.Berlin)).toBe(100n)
      expect(config.hardforkBlock(Hardfork.London)).toBe(200n)
    })

    it('should return null for timestamp-based hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.hardforkBlock(Hardfork.Paris)).toBe(null)
      expect(config.hardforkBlock(Hardfork.Shanghai)).toBe(null)
    })

    it('should use current hardfork if none specified', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Berlin,
      })

      expect(config.hardforkBlock()).toBe(100n)
    })
  })

  describe('getHardforkTimestamp', () => {
    it('should return timestamp for timestamp-based hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.getHardforkTimestamp(Hardfork.Paris)).toBe('1000')
      expect(config.getHardforkTimestamp(Hardfork.Shanghai)).toBe('2000')
      expect(config.getHardforkTimestamp(Hardfork.Cancun)).toBe('3000')
    })

    it('should return undefined for block-based hardforks', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.getHardforkTimestamp(Hardfork.Berlin)).toBeUndefined()
      expect(config.getHardforkTimestamp(Hardfork.London)).toBeUndefined()
    })
  })

  describe('getHardforkBy', () => {
    it('should return hardfork by block number', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.getHardforkBy({ blockNumber: 50n })).toBe(Hardfork.Istanbul)
      expect(config.getHardforkBy({ blockNumber: 100n })).toBe(Hardfork.Berlin)
      expect(config.getHardforkBy({ blockNumber: 150n })).toBe(Hardfork.Berlin)
      expect(config.getHardforkBy({ blockNumber: 200n })).toBe(Hardfork.London)
    })

    it('should return hardfork by timestamp', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Cancun,
      })

      expect(config.getHardforkBy({ timestamp: 1500n })).toBe(Hardfork.Paris)
      expect(config.getHardforkBy({ timestamp: 2500n })).toBe(Hardfork.Shanghai)
      expect(config.getHardforkBy({ timestamp: 3500n })).toBe(Hardfork.Cancun)
    })
  })

  describe('setHardforkBy', () => {
    it('should set hardfork by block number', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.Chainstart,
      })

      const result = config.setHardforkBy({ blockNumber: 150n })
      expect(result).toBe(Hardfork.Berlin)
      expect(config.hardfork()).toBe(Hardfork.Berlin)
    })
  })

  describe('eips', () => {
    it('should return active EIPs as array', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      const eips = config.eips
      expect(Array.isArray(eips)).toBe(true)
      expect(eips).toContain(EIP.EIP_1)
      expect(eips).toContain(EIP.EIP_1559)
    })
  })

  describe('hardforks', () => {
    it('should return all hardforks in schema', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      const hardforks = config.hardforks
      expect(hardforks.length).toBe(13)
      expect(hardforks[0].name).toBe(Hardfork.Chainstart)
      expect(hardforks[hardforks.length - 1].name).toBe(Hardfork.Cancun)
    })
  })

  describe('copy', () => {
    it('should create an independent copy', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      const copy = config.copy()

      expect(copy.hardfork()).toBe(config.hardfork())
      expect(copy.chainId()).toBe(config.chainId())

      config.setHardfork(Hardfork.Berlin)
      expect(copy.hardfork()).toBe(Hardfork.London)
    })

    it('should preserve overrides in copy', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      config.updateParams({ txGas: 25000n })
      const copy = config.copy()

      expect(copy.getParam('txGas')).toBe(25000n)
    })
  })

  describe('consensus methods', () => {
    it('should return ethash as consensus algorithm', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.consensusAlgorithm()).toBe('ethash')
    })

    it('should return pow as consensus type', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
      })

      expect(config.consensusType()).toBe('pow')
    })
  })

  describe('with overrides', () => {
    it('should apply overrides from schema options', () => {
      const config = GlobalConfig.fromSchema({
        schema: testSchema,
        hardfork: Hardfork.London,
        overrides: {
          txGas: 30000n,
          txCreationGas: 40000n,
        },
      })

      expect(config.getParam('txGas')).toBe(30000n)
      expect(config.getParam('txCreationGas')).toBe(40000n)
    })
  })
})
