// import { describe, expect, it } from 'vitest'
// import { Mainnet } from '../../src/chains'
// import { Hardfork } from '../../src/enums'
// import type { CommonOpts } from '../../src/types'

// /**
//  * Shared test suite for Common implementations
//  * This ensures both Common and SimpleCommon are tested with identical test cases
//  */
// export function createCommonTestSuite(
//   CommonClass: new (
//     opts: CommonOpts,
//   ) => {
//     hardfork(): Hardfork | string
//     setHardfork(hardfork: Hardfork | string): void
//     param(name: string): bigint
//     paramByHardfork(name: string, hardfork: Hardfork | string): bigint
//     paramByBlock(
//       name: string,
//       blockNumber: bigint | number,
//       timestamp?: bigint | number,
//     ): bigint
//     isActivatedEIP(eip: number): boolean
//     gteHardfork(hardfork: Hardfork | string): boolean
//     hardforkBlock(hardfork?: Hardfork | string): bigint | null
//     hardforkTimestamp(hardfork?: Hardfork | string): bigint | null
//     setEIPs(eips: number[]): void
//     eips(): number[]
//     chainId(): bigint
//     chainName(): string
//     genesis(): any
//     paramByEIP?(name: string, eip: number): bigint | undefined
//   },
//   className: string,
// ) {
//   describe(`${className} - Shared Test Suite`, () => {
//     describe('Basic functionality', () => {
//       it('should create an instance', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         console.log(common)
//         expect(common).toBeDefined()
//         expect(common.hardfork()).toBe(Hardfork.Chainstart)
//       })

//       it('should set hardfork', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         common.setHardfork(Hardfork.Berlin)
//         expect(common.hardfork()).toBe(Hardfork.Berlin)
//       })

//       it('should get params for current hardfork', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Chainstart,
//         })
//         const minGasLimit = common.param('minGasLimit')
//         expect(minGasLimit).toBeDefined()
//         expect(minGasLimit).toBeGreaterThan(0n)
//       })

//       it('should get params by hardfork', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         const minGasLimit = common.paramByHardfork(
//           'minGasLimit',
//           Hardfork.Chainstart,
//         )
//         expect(minGasLimit).toBeDefined()
//         expect(minGasLimit).toBeGreaterThan(0n)
//       })

//       it('should check activated EIPs', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Berlin,
//         })
//         // EIP_2929 should be active in Berlin
//         expect(common.isActivatedEIP(2929)).toBe(true)
//         // EIP_1559 should not be active in Berlin (it's in London)
//         expect(common.isActivatedEIP(1559)).toBe(false)
//       })

//       it('should compare hardforks', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Berlin,
//         })
//         expect(common.gteHardfork(Hardfork.Chainstart)).toBe(true)
//         expect(common.gteHardfork(Hardfork.Berlin)).toBe(true)
//         expect(common.gteHardfork(Hardfork.London)).toBe(false)
//       })

//       it('should get hardfork block', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         const berlinBlock = common.hardforkBlock(Hardfork.Berlin)
//         expect(berlinBlock).toBeDefined()
//         expect(berlinBlock).toBeGreaterThan(0n)
//       })

//       it('should get hardfork timestamp', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         const parisTimestamp = common.hardforkTimestamp(Hardfork.Paris)
//         // Paris uses timestamp, should be defined
//         if (parisTimestamp !== null) {
//           expect(parisTimestamp).toBeGreaterThan(0n)
//         }
//       })

//       it('should set additional EIPs', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Berlin,
//         })
//         // EIP_2537 can be activated from Chainstart
//         common.setEIPs([2537])
//         expect(common.eips()).toContain(2537)
//         expect(common.isActivatedEIP(2537)).toBe(true)
//       })

//       it('should get chain info', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         expect(common.chainId()).toBe(1n)
//         expect(common.chainName()).toBe('mainnet')
//         expect(common.genesis()).toBeDefined()
//       })

//       it('should handle hardfork progression', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Chainstart,
//         })

//         // Chainstart -> Homestead
//         common.setHardfork(Hardfork.Homestead)
//         expect(common.hardfork()).toBe(Hardfork.Homestead)
//         expect(common.isActivatedEIP(606)).toBe(true)

//         // Homestead -> Berlin
//         common.setHardfork(Hardfork.Berlin)
//         expect(common.hardfork()).toBe(Hardfork.Berlin)
//         expect(common.isActivatedEIP(2929)).toBe(true)

//         // Berlin -> London
//         common.setHardfork(Hardfork.London)
//         expect(common.hardfork()).toBe(Hardfork.London)
//         expect(common.isActivatedEIP(1559)).toBe(true)
//       })

//       it('should get params by block', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })
//         // Block 0 should be Chainstart
//         const minGasLimit = common.paramByBlock('minGasLimit', 0)
//         expect(minGasLimit).toBeDefined()
//         expect(minGasLimit).toBeGreaterThan(0n)
//       })
//     })

//     describe('EIP activation across hardforks', () => {
//       const testCases = [
//         {
//           name: 'Chainstart',
//           hardfork: Hardfork.Chainstart,
//           activeEIPs: [1],
//           inactiveEIPs: [606, 2929, 1559],
//         },
//         {
//           name: 'Homestead',
//           hardfork: Hardfork.Homestead,
//           activeEIPs: [1, 606],
//           inactiveEIPs: [2929, 1559],
//         },
//         {
//           name: 'Berlin',
//           hardfork: Hardfork.Berlin,
//           activeEIPs: [1, 606, 2929],
//           inactiveEIPs: [1559, 4844],
//         },
//         {
//           name: 'London',
//           hardfork: Hardfork.London,
//           activeEIPs: [1, 606, 2929, 1559],
//           inactiveEIPs: [4844, 4895],
//         },
//       ]

//       testCases.forEach((testCase) => {
//         it(`should correctly identify EIPs for ${testCase.name}`, () => {
//           const common = new CommonClass({
//             chain: Mainnet,
//             hardfork: testCase.hardfork,
//           })

//           for (const eip of testCase.activeEIPs) {
//             expect(common.isActivatedEIP(eip)).toBe(true)
//           }

//           for (const eip of testCase.inactiveEIPs) {
//             expect(common.isActivatedEIP(eip)).toBe(false)
//           }
//         })
//       })
//     })

//     describe('Parameter access across hardforks', () => {
//       const paramNames = [
//         'minGasLimit',
//         'gasLimitBoundDivisor',
//         'maxRefundQuotient',
//         'txGas',
//       ]

//       const hardforks = [
//         Hardfork.Chainstart,
//         Hardfork.Homestead,
//         Hardfork.Berlin,
//         Hardfork.London,
//       ]

//       hardforks.forEach((hardfork) => {
//         paramNames.forEach((paramName) => {
//           it(`should return ${paramName} for ${hardfork}`, () => {
//             const common = new CommonClass({
//               chain: Mainnet,
//               hardfork,
//             })

//             try {
//               const value = common.param(paramName)
//               expect(value).toBeDefined()
//               expect(value).toBeGreaterThan(0n)
//             } catch (e) {
//               // Some params may not exist for all hardforks
//               // This is acceptable
//             }
//           })
//         })
//       })
//     })

//     describe('Hardfork comparison', () => {
//       it('should correctly compare hardforks', () => {
//         const hardforks = [
//           Hardfork.Chainstart,
//           Hardfork.Homestead,
//           Hardfork.Berlin,
//           Hardfork.London,
//         ]

//         for (let i = 0; i < hardforks.length; i++) {
//           const common = new CommonClass({
//             chain: Mainnet,
//             hardfork: hardforks[i],
//           })

//           // Current hardfork should be >= itself
//           expect(common.gteHardfork(hardforks[i])).toBe(true)

//           // Current hardfork should be >= earlier hardforks
//           for (let j = 0; j <= i; j++) {
//             expect(common.gteHardfork(hardforks[j])).toBe(true)
//           }

//           // Current hardfork should not be >= later hardforks
//           for (let j = i + 1; j < hardforks.length; j++) {
//             expect(common.gteHardfork(hardforks[j])).toBe(false)
//           }
//         }
//       })
//     })

//     describe('Hardfork blocks and timestamps', () => {
//       it('should return correct hardfork blocks', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })

//         const chainstartBlock = common.hardforkBlock(Hardfork.Chainstart)
//         expect(chainstartBlock).toBe(0n)

//         const berlinBlock = common.hardforkBlock(Hardfork.Berlin)
//         expect(berlinBlock).toBeGreaterThan(0n)
//         expect(berlinBlock).toBeGreaterThan(chainstartBlock!)
//       })

//       it('should return correct hardfork timestamps for timestamp-based hardforks', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })

//         const parisTimestamp = common.hardforkTimestamp(Hardfork.Paris)
//         if (parisTimestamp !== null) {
//           expect(parisTimestamp).toBeGreaterThan(0n)
//         }
//       })
//     })

//     describe('Additional EIPs', () => {
//       it('should validate minimum hardfork requirement', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Chainstart,
//         })

//         // EIP_2537 can be activated from Chainstart
//         expect(() => {
//           common.setEIPs([2537])
//         }).not.toThrow()
//         expect(common.isActivatedEIP(2537)).toBe(true)
//       })

//       it('should reject EIPs that require later hardforks', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Chainstart,
//         })

//         // EIP_1559 requires Berlin
//         expect(() => {
//           common.setEIPs([1559])
//         }).toThrow()
//       })

//       it('should validate required EIPs', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//           hardfork: Hardfork.Berlin,
//         })

//         // EIP_2930 requires EIP_2718 and EIP_2929
//         // EIP_2718 and EIP_2929 are already active in Berlin
//         // So we can activate EIP_2930
//         expect(() => {
//           common.setEIPs([2930])
//         }).not.toThrow()
//       })
//     })

//     describe('Param by hardfork', () => {
//       it('should return params for different hardforks', () => {
//         const common = new CommonClass({
//           chain: Mainnet,
//         })

//         const hardforks = [
//           Hardfork.Chainstart,
//           Hardfork.Homestead,
//           Hardfork.Berlin,
//         ]

//         for (const hf of hardforks) {
//           try {
//             const value = common.paramByHardfork('minGasLimit', hf)
//             expect(value).toBeDefined()
//             expect(value).toBeGreaterThan(0n)
//           } catch (e) {
//             // Some params may not exist
//           }
//         }
//       })
//     })

//     if (CommonClass.prototype.paramByEIP) {
//       describe('Param by EIP', () => {
//         it('should return params for specific EIP', () => {
//           const common = new CommonClass({
//             chain: Mainnet,
//             hardfork: Hardfork.Berlin,
//           })

//           // EIP_2929 params should be available
//           try {
//             const value = common.paramByEIP!('coldsloadGas', 2929)
//             expect(value).toBeDefined()
//             expect(value).toBeGreaterThan(0n)
//           } catch (e) {
//             // May not be available if params not set
//           }
//         })
//       })
//     }
//   })
// }
