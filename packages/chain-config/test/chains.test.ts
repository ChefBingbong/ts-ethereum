import { describe, expect, it } from 'vitest'
import {
  ConsensusAlgorithm,
  ConsensusType,
  getPresetChainConfig,
  Holesky,
  Hoodi,
  Mainnet,
  Sepolia,
} from '../src/chains'
import {
  createMainnetManager,
  mainnetSchema,
} from '../src/chains/presets/mainnet'
import {
  createTestnetManager,
  testnetSchema,
} from '../src/chains/presets/testnet'
import { Hardfork } from '../src/hardforks'

describe('chains', () => {
  describe('ConsensusAlgorithm', () => {
    it('should have ethash algorithm', () => {
      expect(ConsensusAlgorithm.Ethash).toBe('ethash')
    })

    it('should have clique algorithm', () => {
      expect(ConsensusAlgorithm.Clique).toBe('clique')
    })

    it('should have casper algorithm', () => {
      expect(ConsensusAlgorithm.Casper).toBe('casper')
    })
  })

  describe('ConsensusType', () => {
    it('should have pow type', () => {
      expect(ConsensusType.ProofOfWork).toBe('pow')
    })

    it('should have poa type', () => {
      expect(ConsensusType.ProofOfAuthority).toBe('poa')
    })

    it('should have pos type', () => {
      expect(ConsensusType.ProofOfStake).toBe('pos')
    })
  })

  describe('getPresetChainConfig', () => {
    it('should return mainnet by name', () => {
      const config = getPresetChainConfig('mainnet')
      expect(config).toBe(Mainnet)
    })

    it('should return mainnet by chain ID', () => {
      const config = getPresetChainConfig(1)
      expect(config).toBe(Mainnet)
    })

    it('should return sepolia by name', () => {
      const config = getPresetChainConfig('sepolia')
      expect(config).toBe(Sepolia)
    })

    it('should return sepolia by chain ID', () => {
      const config = getPresetChainConfig(11155111)
      expect(config).toBe(Sepolia)
    })

    it('should return holesky by name', () => {
      const config = getPresetChainConfig('holesky')
      expect(config).toBe(Holesky)
    })

    it('should return holesky by chain ID', () => {
      const config = getPresetChainConfig(17000)
      expect(config).toBe(Holesky)
    })

    it('should return hoodi by name', () => {
      const config = getPresetChainConfig('hoodi')
      expect(config).toBe(Hoodi)
    })

    it('should return hoodi by chain ID', () => {
      const config = getPresetChainConfig(560048)
      expect(config).toBe(Hoodi)
    })

    it('should default to mainnet for unknown chains', () => {
      const config = getPresetChainConfig('unknown')
      expect(config).toBe(Mainnet)
    })
  })

  describe('Mainnet', () => {
    it('should have correct chain ID', () => {
      expect(Mainnet.chainId).toBe(1n)
    })

    it('should have correct name', () => {
      expect(Mainnet.name).toBe('mainnet')
    })

    it('should have pow consensus', () => {
      expect(Mainnet.consensus.type).toBe('pow')
      expect(Mainnet.consensus.algorithm).toBe('ethash')
    })

    it('should have genesis config', () => {
      expect(Mainnet.genesis.gasLimit).toBe(5000)
      expect(Mainnet.genesis.difficulty).toBe(17179869184)
    })

    it('should have bootstrap nodes', () => {
      expect(Mainnet.bootstrapNodes.length).toBeGreaterThan(0)
    })

    it('should have hardforks starting with chainstart', () => {
      expect(Mainnet.hardforks[0].name).toBe('chainstart')
      expect(Mainnet.hardforks[0].block).toBe(0n)
    })

    it('should have homestead at block 1150000', () => {
      const homestead = Mainnet.hardforks.find((hf) => hf.name === 'homestead')
      expect(homestead?.block).toBe(1150000n)
    })

    it('should have post-merge hardforks with timestamps', () => {
      const shanghai = Mainnet.hardforks.find((hf) => hf.name === 'shanghai')
      expect(shanghai?.block).toBe(null)
      expect(shanghai?.timestamp).toBeDefined()
    })
  })

  describe('Sepolia', () => {
    it('should have correct chain ID', () => {
      expect(Sepolia.chainId).toBe(11155111n)
    })

    it('should have correct name', () => {
      expect(Sepolia.name).toBe('sepolia')
    })

    it('should have all hardforks at genesis', () => {
      const genesisHardforks = Sepolia.hardforks.filter((hf) => hf.block === 0n)
      expect(genesisHardforks.length).toBeGreaterThan(5)
    })
  })

  describe('Holesky', () => {
    it('should have correct chain ID', () => {
      expect(Holesky.chainId).toBe(17000n)
    })

    it('should have pos consensus', () => {
      expect(Holesky.consensus.type).toBe('pos')
      expect(Holesky.consensus.algorithm).toBe('casper')
    })
  })

  describe('Hoodi', () => {
    it('should have correct chain ID', () => {
      expect(Hoodi.chainId).toBe(560048n)
    })

    it('should have pos consensus', () => {
      expect(Hoodi.consensus.type).toBe('pos')
      expect(Hoodi.consensus.algorithm).toBe('casper')
    })
  })

  describe('mainnetSchema', () => {
    it('should have hardforks array', () => {
      expect(mainnetSchema.hardforks.length).toBeGreaterThan(0)
    })

    it('should have chain ID', () => {
      expect(mainnetSchema.chainId).toBe(12345n)
    })

    it('should include chainstart', () => {
      expect(mainnetSchema.hardforks[0].name).toBe(Hardfork.Chainstart)
    })
  })

  describe('testnetSchema', () => {
    it('should have all hardforks at genesis', () => {
      const blockBasedForks = testnetSchema.hardforks.filter(
        (hf) => hf.block !== null,
      )
      expect(blockBasedForks.every((hf) => hf.block === 0n)).toBe(true)
    })

    it('should have timestamp-based forks at 0', () => {
      const timestampForks = testnetSchema.hardforks.filter(
        (hf) => hf.timestamp !== undefined,
      )
      expect(timestampForks.every((hf) => hf.timestamp === '0')).toBe(true)
    })
  })

  describe('createMainnetManager', () => {
    it('should create a params manager', () => {
      const manager = createMainnetManager()
      expect(manager.currentHardfork).toBe(Hardfork.Prague)
    })

    it('should accept overrides', () => {
      const manager = createMainnetManager({ txGas: 25000n })
      expect(manager.getParam('txGas')).toBe(25000n)
    })
  })

  describe('createTestnetManager', () => {
    it('should create a params manager at osaka by default', () => {
      const manager = createTestnetManager()
      expect(manager.currentHardfork).toBe(Hardfork.Osaka)
    })

    it('should accept custom hardfork', () => {
      const manager = createTestnetManager(Hardfork.London)
      expect(manager.currentHardfork).toBe(Hardfork.London)
    })

    it('should accept overrides', () => {
      const manager = createTestnetManager(Hardfork.London, { txGas: 25000n })
      expect(manager.getParam('txGas')).toBe(25000n)
    })
  })
})
