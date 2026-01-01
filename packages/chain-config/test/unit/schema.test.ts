import { describe, expect, it } from 'vitest'
import {
  createHardforkSchema,
  createParamsManager,
  hardforkEntry,
} from '../../src/chains/schema'
import { Hardfork } from '../../src/hardforks'

describe('schema', () => {
  describe('hardforkEntry', () => {
    it('should create a hardfork entry with block', () => {
      const entry = hardforkEntry(Hardfork.Homestead, { block: 1150000n })

      expect(entry.name).toBe(Hardfork.Homestead)
      expect(entry.block).toBe(1150000n)
    })

    it('should create a hardfork entry with timestamp', () => {
      const entry = hardforkEntry(Hardfork.Shanghai, {
        block: null,
        timestamp: '1681338455',
      })

      expect(entry.name).toBe(Hardfork.Shanghai)
      expect(entry.block).toBe(null)
      expect(entry.timestamp).toBe('1681338455')
    })

    it('should create a hardfork entry with forkHash', () => {
      const entry = hardforkEntry(Hardfork.London, {
        block: 12965000n,
        forkHash: '0xb715077d',
      })

      expect(entry.forkHash).toBe('0xb715077d')
    })

    it('should create an optional hardfork entry', () => {
      const entry = hardforkEntry(Hardfork.Dao, {
        block: 1920000n,
        optional: true,
      })

      expect(entry.optional).toBe(true)
    })

    it('should preserve custom hardfork names', () => {
      const entry = hardforkEntry('myCustomFork', { block: 5000n })

      expect(entry.name).toBe('myCustomFork')
      expect(entry.block).toBe(5000n)
    })
  })

  describe('createHardforkSchema', () => {
    it('should create a schema with hardforks and chainId', () => {
      const schema = createHardforkSchema({
        hardforks: [
          hardforkEntry(Hardfork.Chainstart, { block: 0n }),
          hardforkEntry(Hardfork.Homestead, { block: 1000n }),
        ] as const,
        chainId: 1n,
      })

      expect(schema.hardforks).toHaveLength(2)
      expect(schema.chainId).toBe(1n)
    })

    it('should preserve hardfork order', () => {
      const schema = createHardforkSchema({
        hardforks: [
          hardforkEntry(Hardfork.Chainstart, { block: 0n }),
          hardforkEntry(Hardfork.Homestead, { block: 100n }),
          hardforkEntry(Hardfork.Berlin, { block: 200n }),
          hardforkEntry(Hardfork.London, { block: 300n }),
        ] as const,
        chainId: 12345n,
      })

      expect(schema.hardforks[0].name).toBe(Hardfork.Chainstart)
      expect(schema.hardforks[1].name).toBe(Hardfork.Homestead)
      expect(schema.hardforks[2].name).toBe(Hardfork.Berlin)
      expect(schema.hardforks[3].name).toBe(Hardfork.London)
    })

    it('should include chain config if provided', () => {
      const chainConfig = {
        name: 'testnet',
        chainId: 12345n,
        consensus: { type: 'pow', algorithm: 'ethash' },
        genesis: {
          gasLimit: 10485760,
          difficulty: 1,
          nonce: '0x0000000000000000',
          extraData: '0x',
        },
        hardforks: [],
        bootstrapNodes: [],
      }

      const schema = createHardforkSchema({
        hardforks: [hardforkEntry(Hardfork.Chainstart, { block: 0n })] as const,
        chainId: 12345n,
        chain: chainConfig as any,
      })

      expect(schema.chain).toBe(chainConfig)
    })

    it('should work with all genesis hardforks', () => {
      const schema = createHardforkSchema({
        hardforks: [
          hardforkEntry(Hardfork.Chainstart, { block: 0n }),
          hardforkEntry(Hardfork.Homestead, { block: 0n }),
          hardforkEntry(Hardfork.TangerineWhistle, { block: 0n }),
          hardforkEntry(Hardfork.SpuriousDragon, { block: 0n }),
          hardforkEntry(Hardfork.Byzantium, { block: 0n }),
          hardforkEntry(Hardfork.Constantinople, { block: 0n }),
          hardforkEntry(Hardfork.Petersburg, { block: 0n }),
          hardforkEntry(Hardfork.Istanbul, { block: 0n }),
          hardforkEntry(Hardfork.Berlin, { block: 0n }),
          hardforkEntry(Hardfork.London, { block: 0n }),
        ] as const,
        chainId: 31337n,
      })

      expect(schema.hardforks).toHaveLength(10)
      expect(schema.hardforks.every((hf) => hf.block === 0n)).toBe(true)
    })

    it('should support mixed block and timestamp hardforks', () => {
      const schema = createHardforkSchema({
        hardforks: [
          hardforkEntry(Hardfork.Chainstart, { block: 0n }),
          hardforkEntry(Hardfork.London, { block: 1000n }),
          hardforkEntry(Hardfork.Paris, {
            block: null,
            timestamp: '1681338455',
          }),
          hardforkEntry(Hardfork.Shanghai, {
            block: null,
            timestamp: '1681338456',
          }),
        ] as const,
        chainId: 1n,
      })

      expect(schema.hardforks[0].block).toBe(0n)
      expect(schema.hardforks[1].block).toBe(1000n)
      expect(schema.hardforks[2].block).toBe(null)
      expect(schema.hardforks[2].timestamp).toBe('1681338455')
    })
  })

  describe('createParamsManager', () => {
    it('should create a params manager at chainstart', () => {
      const manager = createParamsManager(Hardfork.Chainstart)

      expect(manager.currentHardfork).toBe(Hardfork.Chainstart)
    })

    it('should create a params manager at london', () => {
      const manager = createParamsManager(Hardfork.London)

      expect(manager.currentHardfork).toBe(Hardfork.London)
      expect(manager.isEIPActive(1559)).toBe(true)
    })

    it('should accept overrides', () => {
      const manager = createParamsManager(Hardfork.London, {
        overrides: { txGas: 25000n },
      })

      expect(manager.getParam('txGas')).toBe(25000n)
    })
  })
})
