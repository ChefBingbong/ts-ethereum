import {
  createHardforkManagerFromConfig,
  Hardfork,
  Mainnet,
} from '@ts-ethereum/chain-config'
import { assert, describe, it } from 'vitest'

import { createEVM } from '../../src'

describe('EVM -> getActiveOpcodes()', () => {
  const DIFFICULTY_PREVRANDAO = 0x44
  const CHAINID = 0x46 //istanbul opcode

  it('should not expose opcodes from a follow-up HF (istanbul -> petersburg)', async () => {
    const common = createHardforkManagerFromConfig(Mainnet)
    const evm = await createEVM({ common, hardfork: Hardfork.Petersburg })
    assert.strictEqual(
      evm.getActiveOpcodes().get(CHAINID),
      undefined,
      'istanbul opcode not exposed (HF: < istanbul (petersburg)',
    )
  })

  it('should expose opcodes when HF is active (>= istanbul)', async () => {
    const common = createHardforkManagerFromConfig(Mainnet)
    let evm = await createEVM({ common, hardfork: Hardfork.Istanbul })
    assert.strictEqual(
      evm.getActiveOpcodes().get(CHAINID)!.name,
      'CHAINID',
      'istanbul opcode exposed (HF: istanbul)',
    )

    evm = await createEVM({ common, hardfork: Hardfork.MuirGlacier })
    assert.strictEqual(
      evm.getActiveOpcodes().get(CHAINID)!.name,
      'CHAINID',
      'istanbul opcode exposed (HF: > istanbul (muirGlacier)',
    )
  })

  it('should switch DIFFICULTY opcode name to PREVRANDAO when >= Merge HF', async () => {
    const common = createHardforkManagerFromConfig(Mainnet)
    let evm = await createEVM({ common, hardfork: Hardfork.Istanbul })
    assert.strictEqual(
      evm.getActiveOpcodes().get(DIFFICULTY_PREVRANDAO)!.name,
      'DIFFICULTY',
      'Opcode x44 named DIFFICULTY pre-Merge',
    )

    evm = await createEVM({ common, hardfork: Hardfork.Paris })
    assert.strictEqual(
      evm.getActiveOpcodes().get(DIFFICULTY_PREVRANDAO)!.name,
      'PREVRANDAO',
      'Opcode x44 named PREVRANDAO post-Merge',
    )
  })

  it('should update opcodes on a hardfork change', async () => {
    const common = createHardforkManagerFromConfig(Mainnet)
    let evm = await createEVM({ common, hardfork: Hardfork.Chainstart })

    evm = await createEVM({ common, hardfork: Hardfork.Byzantium })
    assert.strictEqual(
      evm.getActiveOpcodes().get(CHAINID),
      undefined,
      'opcode not exposed after HF change (-> < istanbul)',
    )

    evm = await createEVM({ common, hardfork: Hardfork.Istanbul })
    assert.strictEqual(
      evm.getActiveOpcodes().get(CHAINID)!.name,
      'CHAINID',
      'opcode exposed after HF change (-> istanbul)',
    )
  })
})
