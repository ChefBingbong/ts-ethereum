import { describe, expect, it } from 'vitest'
import { EIP } from '../../src/hardforks/eips'
import {
  EIP1559_PARAMS,
  EIP1_PARAMS,
  EIP2929_PARAMS,
  EIP4844_PARAMS,
  EIP608_PARAMS,
  EIP_PARAMS,
} from '../../src/hardforks/params'

describe('params', () => {
  describe('EIP1_PARAMS', () => {
    it('should have base transaction gas of 21000', () => {
      expect(EIP1_PARAMS.txGas).toBe(21000n)
    })

    it('should have tx creation gas of 32000', () => {
      expect(EIP1_PARAMS.txCreationGas).toBe(32000n)
    })

    it('should have stack limit of 1024', () => {
      expect(EIP1_PARAMS.stackLimit).toBe(1024)
    })

    it('should have base call gas of 40', () => {
      expect(EIP1_PARAMS.callGas).toBe(40n)
    })

    it('should have sload gas of 50', () => {
      expect(EIP1_PARAMS.sloadGas).toBe(50n)
    })

    it('should have sstore set gas of 20000', () => {
      expect(EIP1_PARAMS.sstoreSetGas).toBe(20000n)
    })

    it('should have minimum difficulty of 1', () => {
      expect(EIP1_PARAMS.minimumDifficulty).toBe(1n)
    })

    it('should have duration limit of 1', () => {
      expect(EIP1_PARAMS.durationLimit).toBe(1n)
    })

    it('should have original miner reward of 5 ETH', () => {
      expect(EIP1_PARAMS.minerReward).toBe(5000000000000000000n)
    })
  })

  describe('EIP1559_PARAMS', () => {
    it('should have base fee max change denominator of 8', () => {
      expect(EIP1559_PARAMS.baseFeeMaxChangeDenominator).toBe(8n)
    })

    it('should have elasticity multiplier of 2', () => {
      expect(EIP1559_PARAMS.elasticityMultiplier).toBe(2n)
    })

    it('should have initial base fee of 1 gwei', () => {
      expect(EIP1559_PARAMS.initialBaseFee).toBe(1000000000n)
    })
  })

  describe('EIP2929_PARAMS', () => {
    it('should have cold sload gas of 2100', () => {
      expect(EIP2929_PARAMS.coldsloadGas).toBe(2100n)
    })

    it('should have cold account access gas of 2600', () => {
      expect(EIP2929_PARAMS.coldaccountaccessGas).toBe(2600n)
    })

    it('should have warm storage read gas of 100', () => {
      expect(EIP2929_PARAMS.warmstoragereadGas).toBe(100n)
    })

    it('should set sload gas to 0 (uses cold/warm distinction)', () => {
      expect(EIP2929_PARAMS.sloadGas).toBe(0n)
    })
  })

  describe('EIP4844_PARAMS', () => {
    it('should have target blob gas per block', () => {
      expect(EIP4844_PARAMS.targetBlobGasPerBlock).toBe(393216n)
    })

    it('should have blob gas per blob of 131072', () => {
      expect(EIP4844_PARAMS.blobGasPerBlob).toBe(131072n)
    })

    it('should have max blob gas per block', () => {
      expect(EIP4844_PARAMS.maxBlobGasPerBlock).toBe(786432n)
    })

    it('should have min blob gas of 1', () => {
      expect(EIP4844_PARAMS.minBlobGas).toBe(1n)
    })

    it('should have kzg point evaluation precompile gas of 50000', () => {
      expect(EIP4844_PARAMS.kzgPointEvaluationPrecompileGas).toBe(50000n)
    })

    it('should have blob commitment version kzg of 1', () => {
      expect(EIP4844_PARAMS.blobCommitmentVersionKzg).toBe(1)
    })

    it('should have 4096 field elements per blob', () => {
      expect(EIP4844_PARAMS.fieldElementsPerBlob).toBe(4096)
    })
  })

  describe('EIP_PARAMS mapping', () => {
    it('should map EIP-1 to EIP1_PARAMS', () => {
      expect(EIP_PARAMS[EIP.EIP_1]).toBe(EIP1_PARAMS)
    })

    it('should map EIP-1559 to EIP1559_PARAMS', () => {
      expect(EIP_PARAMS[EIP.EIP_1559]).toBe(EIP1559_PARAMS)
    })

    it('should map EIP-2929 to EIP2929_PARAMS', () => {
      expect(EIP_PARAMS[EIP.EIP_2929]).toBe(EIP2929_PARAMS)
    })

    it('should map EIP-4844 to EIP4844_PARAMS', () => {
      expect(EIP_PARAMS[EIP.EIP_4844]).toBe(EIP4844_PARAMS)
    })

    it('should have params for all major EIPs', () => {
      const majorEIPs = [
        EIP.EIP_1,
        EIP.EIP_606,
        EIP.EIP_1559,
        EIP.EIP_2929,
        EIP.EIP_2930,
        EIP.EIP_4844,
        EIP.EIP_3855,
        EIP.EIP_3860,
      ]

      for (const eip of majorEIPs) {
        expect(EIP_PARAMS[eip]).toBeDefined()
      }
    })
  })

  describe('gas cost evolution', () => {
    it('should show sload gas increasing from chainstart to tangerine whistle', () => {
      // EIP-1 had sload at 50, EIP-608 (tangerine whistle) raised it to 200
      expect(EIP1_PARAMS.sloadGas).toBe(50n)
      expect(EIP608_PARAMS.sloadGas).toBe(200n)
    })

    it('should show balance gas increasing from chainstart to tangerine whistle', () => {
      expect(EIP1_PARAMS.balanceGas).toBe(20n)
      expect(EIP608_PARAMS.balanceGas).toBe(400n)
    })
  })
})
