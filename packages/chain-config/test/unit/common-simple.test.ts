// import { describe, expect, it } from 'vitest'
// import { Mainnet } from '../../src/chains'
// import { Hardfork } from '../../src/enums'
// import { SimpleCommon } from '../../src/simpleCommon'
// import { createCommonTestSuite } from './common-test-suite'

// // Run the shared test suite for SimpleCommon (new implementation)
// createCommonTestSuite(SimpleCommon, 'SimpleCommon (New Implementation)')

// // Additional tests specific to SimpleCommon features
// describe('SimpleCommon - Additional Features', () => {
//   it('should override params', () => {
//     const common = new SimpleCommon({
//       chain: Mainnet,
//       hardfork: Hardfork.Berlin,
//     })
//     const originalMinGasLimit = common.param('minGasLimit')
//     common.overrideParams({ minGasLimit: 5000 })
//     const overriddenMinGasLimit = common.param('minGasLimit')
//     expect(overriddenMinGasLimit).toBe(5000n)
//     expect(overriddenMinGasLimit).not.toBe(originalMinGasLimit)
//     console.log(common)
//   })
// })
