// import { Hardfork } from '@ts-ethereum/chain-config'
// import { GlobalConfig } from './global-config'
// import {
//   createHardforkSchema,
//   hardforkEntry,
//   HardforkParamManager,
// } from './param-manager'

// /**
//  * TYPE-SAFE HARDFORK SCHEMA EXAMPLE
//  *
//  * This example demonstrates the new schema-driven type system that provides:
//  * 1. Type errors if you misspell a hardfork name in the schema
//  * 2. Type errors if you try to access a hardfork not in your schema via withHardfork
//  * 3. ChainRules that only have flags for hardforks you've defined
//  */

// // ============================================================================
// // Method 1: Create a type-safe schema with the helper functions
// // ============================================================================

// // Create a schema where TypeScript knows exactly which hardforks are available
// const mySchema = createHardforkSchema({
//   hardforks: [
//     // Standard hardforks - these names come from the Hardfork enum
//     hardforkEntry('chainstart', { block: 0n, optional: false }),
//     hardforkEntry('homestead', { block: 10n, optional: false }),
//     hardforkEntry('london', { block: 100n, optional: false }),
//     hardforkEntry('paris', { block: null, timestamp: '1000' }),

//     // Custom hardforks - any string literal works
//     hardforkEntry('myCustomFork', { block: null, timestamp: '2000' }),
//     hardforkEntry('anotherFork', { block: null, timestamp: '3000' }),
//   ] as const, // IMPORTANT: `as const` preserves literal types!
//   chainId: 1337n,
//   validationOpts: {
//     // Tell the validator about custom hardforks
//     customHardforks: ['myCustomFork', 'anotherFork'],
//   },
// })

// // Create manager with full type safety using createFromSchema
// const manager = HardforkParamManager.createFromSchema(
//   Hardfork.Chainstart,
//   mySchema,
// )

// // ✅ TypeScript knows exactly which hardforks are valid
// const currentFork = manager.activeHardfork
// console.log('Active fork:', currentFork)

// manager.getParamByEIP(606, 'delegatecallGas')

// // ✅ withHardfork only accepts forks in the schema
// const parisManager = manager.withHardfork('chainstart')
// parisManager.activeHardfork
// const customManager = manager.withHardfork('myCustomFork')
// const delegatecallGas = parisManager.getParam('basefeeGas')

// // ❌ This would be a type error - 'homestead' is not in our schema:
// // const badManager = manager.withHardfork('homestead')

// // ❌ This would be a type error - typo in fork name:
// // const typoManager = manager.withHardfork('londn')

// // ============================================================================
// // ChainRules are typed based on the schema
// // ============================================================================

// const rules = manager.rules(150n, 2500n)

// // ✅ isLondon is available because 'london' is in our schema
// console.log('Is London:', rules.isLondon)

// // ✅ isParis is available because 'paris' is in our schema
// console.log('Is Paris:', rules.isParis)

// // ❌ isHomestead would be a type error - 'homestead' is not in our schema
// // console.log('Is Homestead:', rules.isHomestead)

// // ============================================================================
// // Method 2: Using the const object pattern for extending Hardfork
// // ============================================================================

// // If you prefer the old pattern, you can still extend Hardfork like this:
// export const HardforkExtended = {
//   ...Hardfork,
//   MyCustomFork: 'myCustomFork',
//   AnotherFork: 'anotherFork',
// } as const

// export type HardforkExtended =
//   (typeof HardforkExtended)[keyof typeof HardforkExtended]

// // Then use createHardforkSchema with the enum values
// const schemaWithEnum = createHardforkSchema({
//   hardforks: [
//     hardforkEntry(Hardfork.Chainstart, { block: 0n, optional: true }),
//     hardforkEntry(Hardfork.London, { block: 100n, optional: true }),
//     hardforkEntry(Hardfork.Paris, { block: null, timestamp: '1000' }),
//     hardforkEntry(HardforkExtended.MyCustomFork, {
//       block: null,
//       timestamp: '2000',
//     }),
//   ] as const,
//   chainId: 1337n,
//   validationOpts: {
//     customHardforks: ['myCustomFork'],
//   },
// })

// const enumManager = HardforkParamManager.createFromSchema(
//   Hardfork.London,
//   schemaWithEnum,
// )

// // ============================================================================
// // Type Safety Demonstrations
// // ============================================================================

// // The schema preserves the exact hardfork names as literal types
// type AvailableForks = (typeof mySchema.hardforks)[number]['name']
// // Type: 'chainstart' | 'london' | 'paris' | 'myCustomFork' | 'anotherFork'

// // You can use this type elsewhere in your code
// function processHardfork(fork: AvailableForks): void {
//   console.log('Processing fork:', fork)
// }

// processHardfork('london') // ✅ OK
// processHardfork('myCustomFork') // ✅ OK
// // processHardfork('homestead')     // ❌ Error: not in AvailableForks

// // ============================================================================
// // Legacy Usage (still supported)
// // ============================================================================

// // The constructor still works - but the generic defaults to Hardfork
// const legacyManager = new HardforkParamManager(Hardfork.London, {
//   schema: {
//     hardforks: [
//       { name: 'chainstart', block: 0n, optional: true },
//       { name: 'london', block: 100, optional: true },
//     ],
//     chainId: 1n,
//   },
// })

// // withHardfork is constrained to standard Hardfork type by default
// const chainstartManager = legacyManager.withHardfork(Hardfork.Chainstart)
// console.log('Legacy fork:', chainstartManager.activeHardfork)

// // You can also switch to london (same as current)
// const londonManager = legacyManager.withHardfork(Hardfork.London)
// console.log('London fork:', londonManager.activeHardfork)

// // For truly untyped usage (not recommended), you can explicitly type as string
// const untypedManager = new HardforkParamManager<string, string>('london')
// const anyFork = untypedManager.withHardfork('anything') // Accepts any string
// console.log('Untyped fork:', anyFork.activeHardfork)

// // ============================================================================
// // GlobalConfig - Full Configuration with Type Safety
// // ============================================================================

// // GlobalConfig provides the same type safety as HardforkParamManager
// // but with additional chain configuration features

// const globalConfigSchema = createHardforkSchema({
//   hardforks: [
//     hardforkEntry('chainstart', { block: 0n }),
//     hardforkEntry('homestead', { block: 10n }),
//     hardforkEntry('london', { block: 100n }),
//     hardforkEntry('paris', { block: null, timestamp: '1000' }),
//     hardforkEntry('prague', { block: null, timestamp: '2000' }),
//   ] as const,
//   chainId: 1n,
// })

// // Create a GlobalConfig from the schema
// const config = GlobalConfig.fromSchema({
//   schema: globalConfigSchema,
//   hardfork: 'london',
// })

// // ✅ Type-safe hardfork switching
// config.setHardfork('paris')
// config.setHardfork('prague')
// // config.setHardfork('osaka')  // ❌ Error: not in schema

// // ✅ Type-safe ChainRules
// const configRules = config.rules(150n, 2500n)
// console.log('Is London:', configRules.isLondon)
// console.log('Is Paris:', configRules.isParis)
// // configRules.isOsaka  // ❌ Error: property doesn't exist

// // ✅ Access parameters
// const baseFee = config.getParam('basefeeGas')
// console.log('Base fee gas:', baseFee)

// // ✅ Check EIP activation
// const isEIP1559Active = config.isActivatedEIP(1559)
// console.log('EIP-1559 active:', isEIP1559Active)

// // ✅ Get hardfork info
// const londonBlock = config.hardforkBlock('london')
// const pragueTimestamp = config.getHardforkTimestamp('prague')
// console.log('London block:', londonBlock)
// console.log('Prague timestamp:', pragueTimestamp)

// // ✅ Copy with preserved types
// const configCopy = config.copy()
// console.log('Copied config hardfork:', configCopy.activeHardfork)
