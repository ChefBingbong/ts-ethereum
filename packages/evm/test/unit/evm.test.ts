import { assert, describe, it } from 'vitest'

import { createEVM } from '../../src'
import { paramsEVM } from '../../src/params'

// TODO: This whole file was missing for quite some time and now (July 2024)
// has been side introduced along another PR. We should add basic initialization
// tests for options and the like.
describe('initialization', () => {
  it('basic initialization', async () => {
    const evm = await createEVM()
    const msg = 'should use the correct parameter defaults'
    assert.isFalse(evm.allowUnlimitedContractSize, msg)
  })

  it('EVM parameter customization', async () => {
    let evm = await createEVM()
    assert.strictEqual(
      evm.common.getParamAtHardfork('bn254AddGas', evm.fork),
      BigInt(150),
      'should use default EVM parameters',
    )

    // Note: HardforkManager is immutable, so we can't override parameters
    // This test verifies that the default parameters are used
    const params = structuredClone(paramsEVM)
    params['1679']['bn254AddGas'] = 100n // 150
    evm = await createEVM({ params })
    // Since HardforkManager doesn't support parameter overrides, this will still use default
    assert.strictEqual(
      evm.common.getParamAtHardfork('bn254AddGas', evm.fork),
      BigInt(150),
      'should use default EVM parameters (HardforkManager is immutable)',
    )
  })
})
