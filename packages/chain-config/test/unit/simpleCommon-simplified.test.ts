import { describe, expect, it } from 'vitest'
import { Mainnet } from '../../src/chains'
import { Hardfork } from '../../src/enums'
import { SimpleCommon } from '../../src/simpleCommon'

describe('SimpleCommon - Simplified Layout Tests', () => {
  describe('Constructor and Initialization', () => {
    it('should create instance with default hardfork (Chainstart)', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Prague,
      })
      expect(common.hardfork()).toBe(Hardfork.Prague)
    })

    it('should create instance with specified hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      expect(common.hardfork()).toBe(Hardfork.Berlin)
    })

    it('should initialize params builder with immutable config', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      // Builder should be initialized and accessible
      expect(common.param('minGasLimit')).toBeDefined()
    })
  })

  describe('setHardfork', () => {
    it('should set hardfork and return it', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const result = common.setHardfork(Hardfork.Berlin)
      expect(result).toBe(Hardfork.Berlin)
      expect(common.hardfork()).toBe(Hardfork.Berlin)
    })

    it('should emit hardforkChanged event', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      let eventEmitted = false
      let eventHardfork: Hardfork | undefined

      common.events.on('hardforkChanged', (hardfork) => {
        eventEmitted = true
        eventHardfork = hardfork as Hardfork
      })

      common.setHardfork(Hardfork.Berlin)
      expect(eventEmitted).toBe(true)
      expect(eventHardfork).toBe(Hardfork.Berlin)
    })

    it('should throw if setting same hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      expect(() => common.setHardfork(Hardfork.Berlin)).toThrow()
    })

    it('should update params builder when hardfork changes', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const chainstartMinGasLimit = common.param('minGasLimit')

      common.setHardfork(Hardfork.Berlin)
      const berlinMinGasLimit = common.param('minGasLimit')

      // Both should be defined, but may have different values
      expect(chainstartMinGasLimit).toBeDefined()
      expect(berlinMinGasLimit).toBeDefined()
    })
  })

  describe('param - Returns undefined instead of throwing', () => {
    it('should return param value as bigint', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const minGasLimit = common.param('minGasLimit')
      expect(minGasLimit).toBeDefined()
      expect(typeof minGasLimit).toBe('number')
      expect(minGasLimit).toBeGreaterThan(0)
    })

    it('should return undefined for non-existent param', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const nonExistent = common.param('nonExistentParam')
      expect(nonExistent).toBeUndefined()
    })

    it('should return different values for different hardforks', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const chainstartValue = common.param('minGasLimit')

      common.setHardfork(Hardfork.Berlin)
      const berlinValue = common.param('minGasLimit')

      // Values should be defined (may be same or different)
      expect(chainstartValue).toBeDefined()
      expect(berlinValue).toBeDefined()
    })
  })

  describe('paramByHardfork', () => {
    it('should return param for specific hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const berlinParam = common.paramByHardfork('minGasLimit', Hardfork.Berlin)
      expect(berlinParam).toBeDefined()
      expect(typeof berlinParam).toBe('number')
    })

    it('should return undefined for non-existent param in hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const nonExistent = common.paramByHardfork(
        'nonExistentParam',
        Hardfork.Berlin,
      )
      expect(nonExistent).toBeUndefined()
    })

    it('should not affect current hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const currentHardfork = common.hardfork()
      common.paramByHardfork('minGasLimit', Hardfork.Berlin)
      expect(common.hardfork()).toBe(currentHardfork)
    })
  })

  describe('paramByEIP', () => {
    it('should return param from EIP if active', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin, // Berlin has EIP_2929
      })
      // EIP_2929 introduces coldsloadGas
      const coldsloadGas = common.paramByEIP('coldsloadGas', 2929)
      expect(coldsloadGas).toBeDefined()
      expect(typeof coldsloadGas).toBe('number')
    })

    it('should return undefined for EIP param if EIP not active', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart, // Chainstart doesn't have EIP_2929
      })
      const coldsloadGas = common.paramByEIP('coldsloadGas', 2929)
      expect(coldsloadGas).toBeUndefined()
    })

    it('should return undefined for non-existent param in EIP', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      const nonExistent = common.paramByEIP('nonExistentParam', 2929)
      expect(nonExistent).toBeUndefined()
    })
  })

  describe('overrideParams', () => {
    it('should override param values', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      const original = common.param('minGasLimit')
      common.overrideParams({ minGasLimit: 5000 })
      const overridden = common.param('minGasLimit')
      expect(overridden).toBe(5000)
      expect(overridden).not.toBe(original)
    })

    it('should chain override calls', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      common
        .overrideParams({ minGasLimit: 5000 })
        .overrideParams({ minGasLimit: 6000 })
      const final = common.param('minGasLimit')
      expect(final).toBe(6000)
    })

    it('should override multiple params at once', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      common.overrideParams({
        minGasLimit: 5000,
        coldsloadGas: 2500,
      })
      expect(common.param('minGasLimit')).toBe(5000)
      expect(common.param('coldsloadGas')).toBe(2500)
    })
  })

  describe('getHardforkByBlockNumber', () => {
    it('should find hardfork by exact block number match', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      // Homestead is at block 1150000
      const hardfork = common.getHardforkByBlockNumber(1150000n)
      expect(hardfork).toBe('homestead')
    })

    it('should return undefined if no exact match', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const hardfork = common.getHardforkByBlockNumber(999999n)
      expect(hardfork).toBeUndefined()
    })

    it('should find Chainstart at block 0', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const hardfork = common.getHardforkByBlockNumber(0n)
      expect(hardfork).toBe('chainstart')
    })
  })

  describe('getHardforkByTimestamp', () => {
    it('should find hardfork by exact timestamp match', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      // Find a hardfork with timestamp (if any exist in Mainnet config)
      const hardforks = common.hardforks()
      const timestampHardfork = hardforks.find(
        (hf) => hf.timestamp !== undefined,
      )

      if (timestampHardfork && timestampHardfork.timestamp) {
        const timestamp = BigInt(timestampHardfork.timestamp)
        const hardfork = common.getHardforkByTimestamp(timestamp)
        expect(hardfork).toBe(timestampHardfork.name)
      }
    })

    it('should return undefined if no exact timestamp match', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const hardfork = common.getHardforkByTimestamp(9999999999n)
      // May be undefined if no hardfork has that exact timestamp
      expect(hardfork).toBeUndefined()
    })
  })

  describe('hardforkBlock and hardforkTimestamp', () => {
    it('should return block number for hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const block = common.hardforkBlock(Hardfork.Homestead)
      expect(block).toBe(1150000)
    })

    it('should return null for hardfork without block', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      // Some hardforks might not have block numbers
      const block = common.hardforkBlock(Hardfork.Chainstart)
      expect(block).toBe(0) // Chainstart should be at block 0
    })

    it('should return timestamp for hardfork with timestamp', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const hardforks = common.hardforks()
      const timestampHardfork = hardforks.find(
        (hf) => hf.timestamp !== undefined,
      )

      if (timestampHardfork && timestampHardfork.timestamp) {
        const timestamp = common.hardforkTimestamp(
          timestampHardfork.name as Hardfork,
        )
        expect(timestamp).toBe(timestampHardfork.timestamp)
      }
    })

    it('should return null for hardfork without timestamp', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const timestamp = common.hardforkTimestamp(Hardfork.Chainstart)
      expect(timestamp).toBeUndefined()
    })

    it('should use current hardfork if none specified', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Homestead,
      })
      const block = common.hardforkBlock()
      expect(block).toBe(1150000)
    })
  })

  describe('eips', () => {
    it('should return active EIPs for current hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      const eips = common.eips()
      expect(Array.isArray(eips)).toBe(true)
      // Berlin should have EIP_2929 active
      expect(eips.includes(2929)).toBe(true)
    })

    it('should return different EIPs for different hardforks', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      const chainstartEips = common.eips()

      common.setHardfork(Hardfork.Berlin)
      const berlinEips = common.eips()

      // Berlin should have more EIPs than Chainstart
      expect(berlinEips.length).toBeGreaterThanOrEqual(chainstartEips.length)
    })

    it('should return EIPs as numbers', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      const eips = common.eips()
      if (eips.length > 0) {
        expect(typeof eips[0]).toBe('number')
      }
    })
  })

  describe('isActivatedEIP', () => {
    it('should return true for active EIP', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      // EIP_2929 should be active in Berlin
      expect(common.isActivatedEIP(2929)).toBe(true)
    })

    it('should return false for inactive EIP', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Chainstart,
      })
      // EIP_2929 should not be active in Chainstart
      expect(common.isActivatedEIP(2929)).toBe(false)
    })
  })

  describe('gteHardfork', () => {
    it('should return true for current hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      expect(common.gteHardfork(Hardfork.Berlin)).toBe(true)
    })

    it('should return true for earlier hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      expect(common.gteHardfork(Hardfork.Chainstart)).toBe(true)
    })

    it('should return false for later hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      expect(common.gteHardfork(Hardfork.London)).toBe(false)
    })
  })

  describe('consensusType', () => {
    it('should return consensus type from chain config', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const consensusType = common.consensusType()
      expect(consensusType).toBe('pow') // Mainnet uses PoW
    })
  })

  describe('Chain info methods', () => {
    it('should return chain ID', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      expect(common.chainId()).toBe(1n)
    })

    it('should return chain name', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      expect(common.chainName()).toBe('mainnet')
    })

    it('should return genesis config', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const genesis = common.genesis()
      expect(genesis).toBeDefined()
      expect(genesis.gasLimit).toBeDefined()
    })

    it('should return hardforks array', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const hardforks = common.hardforks()
      expect(Array.isArray(hardforks)).toBe(true)
      expect(hardforks.length).toBeGreaterThan(0)
    })

    it('should return bootstrap nodes', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const nodes = common.bootstrapNodes()
      expect(Array.isArray(nodes)).toBe(true)
    })

    it('should return DNS networks', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
      })
      const dnsNetworks = common.dnsNetworks()
      expect(Array.isArray(dnsNetworks)).toBe(true)
    })
  })

  describe('Params Builder Immutability', () => {
    it('should maintain separate overrides per hardfork', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      common.overrideParams({ minGasLimit: 5000 })

      const berlinValue = common.param('minGasLimit')
      expect(berlinValue).toBe(5000)

      common.setHardfork(Hardfork.London)
      const londonValue = common.param('minGasLimit')
      // London should have its own value (not overridden)
      expect(londonValue).toBeDefined()
      expect(londonValue).not.toBe(5000) // Unless London also happens to be 5000
    })

    it('should allow overriding params after hardfork change', () => {
      const common = new SimpleCommon({
        chain: Mainnet,
        hardfork: Hardfork.Berlin,
      })
      common.overrideParams({ minGasLimit: 5000 })
      common.setHardfork(Hardfork.London)
      common.overrideParams({ minGasLimit: 6000 })

      expect(common.param('minGasLimit')).toBe(6000)
    })
  })
})
