import { describe, expect, it } from 'vitest'
import {
  Chain,
  getGenesis,
  parseGethGenesis,
  parseGethGenesisState,
} from '../src/genesis'

describe('genesis', () => {
  describe('Chain enum', () => {
    it('should have mainnet as 1', () => {
      expect(Chain.Mainnet).toBe(1)
    })

    it('should have sepolia as 11155111', () => {
      expect(Chain.Sepolia).toBe(11155111)
    })

    it('should have holesky as 17000', () => {
      expect(Chain.Holesky).toBe(17000)
    })

    it('should have hoodi as 560048', () => {
      expect(Chain.Hoodi).toBe(560048)
    })
  })

  describe('getGenesis', () => {
    it('should return mainnet genesis', () => {
      const genesis = getGenesis(Chain.Mainnet)
      expect(genesis).toBeDefined()
    })

    it('should return sepolia genesis', () => {
      const genesis = getGenesis(Chain.Sepolia)
      expect(genesis).toBeDefined()
    })

    it('should return holesky genesis', () => {
      const genesis = getGenesis(Chain.Holesky)
      expect(genesis).toBeDefined()
    })

    it('should return hoodi genesis', () => {
      const genesis = getGenesis(Chain.Hoodi)
      expect(genesis).toBeDefined()
    })

    it('should return undefined for unknown chain', () => {
      const genesis = getGenesis(99999)
      expect(genesis).toBeUndefined()
    })
  })

  describe('parseGethGenesisState', () => {
    it('should parse empty alloc', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {},
      }

      const state = parseGethGenesisState(gethGenesis as any)
      expect(Object.keys(state)).toHaveLength(0)
    })

    it('should parse account with balance', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {
          '1234567890123456789012345678901234567890': {
            balance: '1000000000000000000',
          },
        },
      }

      const state = parseGethGenesisState(gethGenesis as any)
      const address = '0x1234567890123456789012345678901234567890'

      expect(state[address]).toBeDefined()
      expect(state[address][0]).toBe('0xde0b6b3a7640000') // 1 ETH in hex
    })

    it('should parse account with code', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {
          '1234567890123456789012345678901234567890': {
            balance: '0',
            code: '0x600160005260206000f3',
          },
        },
      }

      const state = parseGethGenesisState(gethGenesis as any)
      const address = '0x1234567890123456789012345678901234567890'

      expect(state[address][1]).toBe('0x600160005260206000f3')
    })

    it('should parse account with storage', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {
          '1234567890123456789012345678901234567890': {
            balance: '0',
            storage: {
              '0x0000000000000000000000000000000000000000000000000000000000000000':
                '0x0000000000000000000000000000000000000000000000000000000000000001',
            },
          },
        },
      }

      const state = parseGethGenesisState(gethGenesis as any)
      const address = '0x1234567890123456789012345678901234567890'

      expect(state[address][2]).toHaveLength(1)
      expect(state[address][2][0][0]).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      )
      expect(state[address][2][0][1]).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      )
    })

    it('should parse account with nonce', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {
          '1234567890123456789012345678901234567890': {
            balance: '0',
            nonce: '0x5',
          },
        },
      }

      const state = parseGethGenesisState(gethGenesis as any)
      const address = '0x1234567890123456789012345678901234567890'

      expect(state[address][3]).toBe('0x5')
    })

    it('should lowercase addresses', () => {
      const gethGenesis = {
        config: { chainId: 1 },
        difficulty: '0x1',
        gasLimit: '0x1000000',
        nonce: '0x0',
        alloc: {
          ABCDEF1234567890ABCDEF1234567890ABCDEF12: {
            balance: '1000000000000000000',
          },
        },
      }

      const state = parseGethGenesisState(gethGenesis as any)
      expect(
        state['0xabcdef1234567890abcdef1234567890abcdef12'],
      ).toBeDefined()
    })
  })

  describe('parseGethGenesis', () => {
    const validGethGenesis = {
      config: {
        chainId: 12345,
        homesteadBlock: 0,
        eip150Block: 0,
        eip155Block: 0,
        eip158Block: 0,
        byzantiumBlock: 0,
        constantinopleBlock: 0,
        petersburgBlock: 0,
        istanbulBlock: 0,
      },
      name: 'test-chain',
      difficulty: '0x1',
      gasLimit: '0x1000000',
      nonce: '0x0000000000000000',
      alloc: {},
    }

    it('should parse valid geth genesis', () => {
      const result = parseGethGenesis(validGethGenesis as any)

      expect(result.chainId).toBe(12345)
      expect(result.name).toBe('test-chain')
    })

    it('should parse genesis block params', () => {
      const result = parseGethGenesis(validGethGenesis as any)

      expect(result.genesis.difficulty).toBe('0x1')
      expect(result.genesis.gasLimit).toBe('0x1000000')
      expect(result.genesis.nonce).toBe('0x0000000000000000')
    })

    it('should parse hardforks from block numbers', () => {
      const result = parseGethGenesis(validGethGenesis as any)

      expect(result.hardforks.length).toBeGreaterThan(0)
      expect(result.hardforks[0].name).toBe('chainstart')
    })

    it('should parse timestamp-based hardforks', () => {
      const genesisWithTimestamps = {
        ...validGethGenesis,
        config: {
          ...validGethGenesis.config,
          shanghaiTime: 1681338455,
        },
      }

      const result = parseGethGenesis(genesisWithTimestamps as any)

      const shanghai = result.hardforks.find((hf) => hf.name === 'shanghai')
      expect(shanghai?.timestamp).toBe(1681338455)
    })

    it('should use provided name', () => {
      const result = parseGethGenesis(validGethGenesis as any, 'custom-name')

      expect(result.name).toBe('custom-name')
    })

    it('should detect clique consensus', () => {
      const cliqueGenesis = {
        ...validGethGenesis,
        config: {
          ...validGethGenesis.config,
          clique: {
            period: 15,
            epoch: 30000,
          },
        },
      }

      const result = parseGethGenesis(cliqueGenesis as any)

      expect(result.consensus.type).toBe('poa')
      expect(result.consensus.algorithm).toBe('clique')
      expect(result.consensus.clique?.period).toBe(15)
      expect(result.consensus.clique?.epoch).toBe(30000)
    })

    it('should default to ethash consensus', () => {
      const result = parseGethGenesis(validGethGenesis as any)

      expect(result.consensus.type).toBe('pow')
      expect(result.consensus.algorithm).toBe('ethash')
    })

    it('should throw for missing required fields', () => {
      const invalidGenesis = {
        config: { chainId: 1 },
        // Missing difficulty, gasLimit, nonce, alloc
      }

      expect(() => parseGethGenesis(invalidGenesis as any)).toThrow()
    })

    it('should throw for mismatched EIP-155 and EIP-158 blocks', () => {
      const invalidGenesis = {
        ...validGethGenesis,
        config: {
          ...validGethGenesis.config,
          eip155Block: 100,
          eip158Block: 200,
        },
      }

      expect(() => parseGethGenesis(invalidGenesis as any)).toThrow()
    })

    it('should handle terminalTotalDifficultyPassed', () => {
      const postMergeGenesis = {
        ...validGethGenesis,
        config: {
          ...validGethGenesis.config,
          terminalTotalDifficultyPassed: true,
        },
      }

      const result = parseGethGenesis(postMergeGenesis as any)

      // Should have paris hardfork
      const paris = result.hardforks.find((hf) => hf.name === 'paris')
      expect(paris).toBeDefined()
    })

    it('should format short nonce correctly', () => {
      const genesisWithShortNonce = {
        ...validGethGenesis,
        nonce: '0x42',
      }

      const result = parseGethGenesis(genesisWithShortNonce as any)

      expect(result.genesis.nonce).toBe('0x0000000000000042')
    })
  })
})

