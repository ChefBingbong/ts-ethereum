// import { describe, expect, it } from 'vitest'
// import { Mainnet } from '../../src/chains'
// import { Common } from '../../src/common'
// import { Hardfork } from '../../src/enums'
// import { SimpleCommon } from '../../src/simpleCommon'

// /**
//  * Direct comparison tests between Common and SimpleCommon
//  * Since both implementations use the same test suite, this focuses on
//  * verifying they produce identical outputs for the same inputs
//  */
// describe('Common vs SimpleCommon - Direct Comparison', () => {
//   describe('Same config initialization', () => {
//     it('should create both with same config', () => {
//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       expect(common.chainId()).toBe(simpleCommon.chainId())
//       expect(common.chainName()).toBe(simpleCommon.chainName())
//       expect(common.hardfork()).toBe(simpleCommon.hardfork())
//     })
//   })

//   describe('Parameter values match', () => {
//     const hardforks = [
//       Hardfork.Chainstart,
//       Hardfork.Homestead,
//       Hardfork.Berlin,
//       Hardfork.London,
//     ]

//     const paramNames = [
//       'minGasLimit',
//       'gasLimitBoundDivisor',
//       'maxRefundQuotient',
//       'txGas',
//       'coldsloadGas', // Berlin-specific
//       'coldaccountaccessGas', // Berlin-specific
//     ]

//     hardforks.forEach((hardfork) => {
//       paramNames.forEach((paramName) => {
//         it(`should return same ${paramName} for ${hardfork}`, () => {
//           const common = new Common({
//             chain: Mainnet,
//             hardfork,
//           })
//           const simpleCommon = new SimpleCommon({
//             chain: Mainnet,
//             hardfork,
//           })

//           try {
//             const commonValue = common.param(paramName)
//             const simpleValue = simpleCommon.param(paramName)
//             expect(simpleValue).toBe(commonValue)
//           } catch (e) {
//             // If param doesn't exist, both should throw
//             expect(() => common.param(paramName)).toThrow()
//             expect(() => simpleCommon.param(paramName)).toThrow()
//           }
//         })
//       })
//     })
//   })

//   describe('EIP activation matches', () => {
//     const testEIPs = [1, 606, 2929, 1559, 4844, 4895]

//     const hardforks = [
//       Hardfork.Chainstart,
//       Hardfork.Homestead,
//       Hardfork.Berlin,
//       Hardfork.London,
//     ]

//     hardforks.forEach((hardfork) => {
//       testEIPs.forEach((eip) => {
//         it(`should match EIP ${eip} activation for ${hardfork}`, () => {
//           const common = new Common({
//             chain: Mainnet,
//             hardfork,
//           })
//           const simpleCommon = new SimpleCommon({
//             chain: Mainnet,
//             hardfork,
//           })

//           const commonActivated = common.isActivatedEIP(eip)
//           const simpleActivated = simpleCommon.isActivatedEIP(eip)
//           expect(simpleActivated).toBe(commonActivated)
//         })
//       })
//     })
//   })

//   describe('Hardfork comparison matches', () => {
//     it('should match hardfork comparison results', () => {
//       const hardforks = [
//         Hardfork.Chainstart,
//         Hardfork.Homestead,
//         Hardfork.Berlin,
//         Hardfork.London,
//       ]

//       for (const currentHF of hardforks) {
//         const common = new Common({
//           chain: Mainnet,
//           hardfork: currentHF,
//         })
//         const simpleCommon = new SimpleCommon({
//           chain: Mainnet,
//           hardfork: currentHF,
//         })

//         for (const compareHF of hardforks) {
//           const commonGte = common.gteHardfork(compareHF)
//           const simpleGte = simpleCommon.gteHardfork(compareHF)
//           expect(simpleGte).toBe(commonGte)
//         }
//       }
//     })
//   })

//   describe('Hardfork blocks and timestamps match', () => {
//     it('should return same hardfork blocks', () => {
//       const hardforks = [
//         Hardfork.Chainstart,
//         Hardfork.Homestead,
//         Hardfork.Berlin,
//         Hardfork.London,
//       ]

//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       for (const hf of hardforks) {
//         const commonBlock = common.hardforkBlock(hf)
//         const simpleBlock = simpleCommon.hardforkBlock(hf)
//         expect(simpleBlock).toEqual(commonBlock)
//       }
//     })

//     it('should return same hardfork timestamps', () => {
//       const timestampHardforks = [Hardfork.Paris, Hardfork.Shanghai]

//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       for (const hf of timestampHardforks) {
//         const commonTimestamp = common.hardforkTimestamp(hf)
//         const simpleTimestamp = simpleCommon.hardforkTimestamp(hf)
//         expect(simpleTimestamp).toEqual(commonTimestamp)
//       }
//     })
//   })

//   describe('Additional EIPs match', () => {
//     it('should handle additional EIPs the same way', () => {
//       const common = new Common({
//         chain: Mainnet,
//         hardfork: Hardfork.Berlin,
//       })
//       const simpleCommon = new SimpleCommon({
//         chain: Mainnet,
//         hardfork: Hardfork.Berlin,
//       })

//       // EIP_2537 can be activated from Chainstart
//       common.setEIPs([2537])
//       simpleCommon.setEIPs([2537])

//       expect(common.eips()).toEqual(simpleCommon.eips())
//       expect(common.isActivatedEIP(2537)).toBe(
//         simpleCommon.isActivatedEIP(2537),
//       )
//     })
//   })

//   describe('Param by hardfork matches', () => {
//     it('should return same params for different hardforks', () => {
//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       const hardforks = [
//         Hardfork.Chainstart,
//         Hardfork.Homestead,
//         Hardfork.Berlin,
//       ]

//       for (const hf of hardforks) {
//         try {
//           const commonValue = common.paramByHardfork('minGasLimit', hf)
//           const simpleValue = simpleCommon.paramByHardfork('minGasLimit', hf)
//           expect(simpleValue).toBe(commonValue)
//         } catch (e) {
//           // Both should throw if param doesn't exist
//         }
//       }
//     })
//   })

//   describe('Chain info matches', () => {
//     it('should return same chain info', () => {
//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       expect(common.chainId()).toBe(simpleCommon.chainId())
//       expect(common.chainName()).toBe(simpleCommon.chainName())
//       expect(common.genesis()).toEqual(simpleCommon.genesis())
//     })
//   })

//   describe('Hardfork progression sequence matches', () => {
//     it('should match behavior through hardfork progression', () => {
//       const progression = [
//         Hardfork.Chainstart,
//         Hardfork.Homestead,
//         Hardfork.Berlin,
//         Hardfork.London,
//       ]

//       const common = new Common({ chain: Mainnet })
//       const simpleCommon = new SimpleCommon({ chain: Mainnet })

//       for (const hf of progression) {
//         common.setHardfork(hf)
//         simpleCommon.setHardfork(hf)

//         expect(common.hardfork()).toBe(simpleCommon.hardfork())
//         expect(common.hardfork()).toBe(hf)

//         // Check a common param
//         try {
//           const commonMinGas = common.param('minGasLimit')
//           const simpleMinGas = simpleCommon.param('minGasLimit')
//           expect(simpleMinGas).toBe(commonMinGas)
//         } catch (e) {
//           // Both should throw if param doesn't exist
//         }
//       }
//     })
//   })
// })
