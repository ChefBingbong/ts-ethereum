import { describe, expect, it } from 'vitest'
import {
  createCommonFromGethGenesis,
  createCustomCommon,
  schemaFromChainConfig,
} from '../src/builder'
import { GlobalConfig } from '../src/config/global-config'
import { Hardfork } from '../src/hardforks'
import type { ChainConfig } from '../src/types'

const testChainConfig: ChainConfig = {
  name: 'test-chain',
  chainId: 12345n,
  defaultHardfork: 'london',
  consensus: {
    type: 'pow',
    algorithm: 'ethash',
  },
  genesis: {
    gasLimit: 10485760,
    difficulty: 1,
    nonce: '0x0000000000000000',
    extraData: '0x',
  },
  hardforks: [
    { name: 'chainstart', block: 0n },
    { name: 'homestead', block: 0n },
    { name: 'tangerineWhistle', block: 0n },
    { name: 'spuriousDragon', block: 0n },
    { name: 'byzantium', block: 0n },
    { name: 'constantinople', block: 0n },
    { name: 'petersburg', block: 0n },
    { name: 'istanbul', block: 0n },
    { name: 'berlin', block: 100n },
    { name: 'london', block: 200n },
    { name: 'paris', block: null, timestamp: '1000' },
  ],
  bootstrapNodes: [],
}

describe('builder', () => {
  describe('schemaFromChainConfig', () => {
    it('should create a schema from chain config', () => {
      const schema = schemaFromChainConfig(testChainConfig)

      expect(schema.chainId).toBe(12345n)
      expect(schema.hardforks).toHaveLength(11)
    })

    it('should preserve hardfork blocks', () => {
      const schema = schemaFromChainConfig(testChainConfig)

      const berlin = schema.hardforks.find((hf) => hf.name === 'berlin')
      expect(berlin?.block).toBe(100n)

      const london = schema.hardforks.find((hf) => hf.name === 'london')
      expect(london?.block).toBe(200n)
    })

    it('should preserve hardfork timestamps', () => {
      const schema = schemaFromChainConfig(testChainConfig)

      const paris = schema.hardforks.find((hf) => hf.name === 'paris')
      expect(paris?.block).toBe(null)
      expect(paris?.timestamp).toBe('1000')
    })

    it('should preserve forkHash if provided', () => {
      const configWithForkHash: ChainConfig = {
        ...testChainConfig,
        hardforks: [
          { name: 'chainstart', block: 0n, forkHash: '0xfc64ec04' },
          { name: 'homestead', block: 100n, forkHash: '0x97c2c34c' },
        ],
      }

      const schema = schemaFromChainConfig(configWithForkHash)

      expect(schema.hardforks[0].forkHash).toBe('0xfc64ec04')
      expect(schema.hardforks[1].forkHash).toBe('0x97c2c34c')
    })

    it('should preserve optional flag', () => {
      const configWithOptional: ChainConfig = {
        ...testChainConfig,
        hardforks: [
          { name: 'chainstart', block: 0n },
          { name: 'dao', block: 1920000n, optional: true },
        ],
      }

      const schema = schemaFromChainConfig(configWithOptional)

      expect(schema.hardforks[1].optional).toBe(true)
    })

    it('should include chain reference', () => {
      const schema = schemaFromChainConfig(testChainConfig)

      expect(schema.chain).toBe(testChainConfig)
    })
  })

  describe('createCustomCommon', () => {
    it('should create a GlobalConfig from partial chain config', () => {
      const baseChain: ChainConfig = {
        ...testChainConfig,
        chainId: 1n,
      }

      const config = createCustomCommon({ chainId: 99999n }, baseChain)

      expect(config).toBeInstanceOf(GlobalConfig)
      expect(config.chainId()).toBe(99999n)
    })

    it('should use default hardfork from opts', () => {
      const config = createCustomCommon({}, testChainConfig, {
        hardfork: Hardfork.Berlin,
      })

      expect(config.hardfork()).toBe(Hardfork.Berlin)
    })

    it('should default to chainstart if no hardfork specified', () => {
      const config = createCustomCommon({}, testChainConfig)

      expect(config.hardfork()).toBe(Hardfork.Chainstart)
    })

    it('should apply params overrides', () => {
      const config = createCustomCommon({}, testChainConfig, {
        hardfork: Hardfork.London,
        params: {
          block: {
            txGas: 25000n,
          },
        },
      })

      expect(config.getParam('txGas')).toBe(25000n)
    })

    it('should merge partial config with base chain', () => {
      const baseChain: ChainConfig = {
        ...testChainConfig,
        name: 'base-chain',
      }

      const config = createCustomCommon({ name: 'custom-chain' }, baseChain)

      expect(config.chainName()).toBe('custom-chain')
    })
  })

  describe('createCommonFromGethGenesis', () => {
    const gethGenesis = {
      config: {
        chainId: 54321,
        homesteadBlock: 0,
        eip150Block: 0,
        eip155Block: 0,
        eip158Block: 0,
        byzantiumBlock: 0,
        constantinopleBlock: 0,
        petersburgBlock: 0,
        istanbulBlock: 0,
        berlinBlock: 0,
        londonBlock: 0,
        terminalTotalDifficultyPassed: true,
        shanghaiTime: 0,
      },
      name: 'geth-testnet',
      difficulty: '0x1',
      gasLimit: '0x1000000',
      nonce: '0x0000000000000000',
      alloc: {
        '0x1234567890123456789012345678901234567890': {
          balance: '1000000000000000000000',
        },
      },
    }

    it('should create a GlobalConfig from geth genesis', () => {
      const config = createCommonFromGethGenesis(gethGenesis, {
        chain: 'test',
      })

      expect(config).toBeInstanceOf(GlobalConfig)
      expect(config.chainId()).toBe(54321n)
    })

    it('should use specified hardfork', () => {
      const config = createCommonFromGethGenesis(gethGenesis, {
        hardfork: Hardfork.London,
      })

      expect(config.hardfork()).toBe(Hardfork.London)
    })

    it('should apply params overrides', () => {
      const config = createCommonFromGethGenesis(gethGenesis, {
        hardfork: Hardfork.London,
        params: {
          block: {
            txGas: 30000n,
          },
        },
      })

      expect(config.getParam('txGas')).toBe(30000n)
    })

    it('should set fork hashes if genesis hash provided', () => {
      const genesisHash = new Uint8Array(32).fill(0xab)

      const config = createCommonFromGethGenesis(gethGenesis, {
        genesisHash,
      })

      // Fork hashes should be set
      expect(() => config.forkHash(Hardfork.Chainstart, genesisHash)).not.toThrow()
    })

    it('should parse hardforks from block numbers', () => {
      const genesis = {
        ...gethGenesis,
        config: {
          ...gethGenesis.config,
          homesteadBlock: 100,
          berlinBlock: 200,
          londonBlock: 300,
        },
      }

      const config = createCommonFromGethGenesis(genesis, {})

      // The hardforks should be parsed from the config
      expect(config.hardforkBlock(Hardfork.Chainstart)).toBe(0n)
    })

    it('should parse hardforks from timestamps', () => {
      const genesis = {
        ...gethGenesis,
        config: {
          ...gethGenesis.config,
          shanghaiTime: 1681338455,
          cancunTime: 1710338135,
        },
      }

      const config = createCommonFromGethGenesis(genesis, {})

      expect(config.getHardforkTimestamp(Hardfork.Shanghai)).toBeDefined()
    })

    it('should throw for invalid genesis', () => {
      const invalidGenesis = {
        config: { chainId: 1 },
        // Missing required fields
      }

      expect(() =>
        createCommonFromGethGenesis(invalidGenesis as any, {}),
      ).toThrow()
    })
  })
})

