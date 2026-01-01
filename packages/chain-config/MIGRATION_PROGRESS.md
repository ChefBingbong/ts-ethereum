# Chain Config Schema Migration Progress

## Overview
Migrating from manual type definitions to schema-first architecture with type inference from parameter definitions.

**Goal**: Single source of truth for chain configuration and EIP parameters, with all types inferred from actual data.

---

## ✅ Completed Phases

### Phase 1: Extended Schema with ChainConfig Fields ✅
**Status**: Complete

**Changes**:
- Extended `TypedHardforkSchema` to include all ChainConfig fields (`name`, `genesis`, `bootstrapNodes`, `consensus`, etc.)
- Updated `GlobalConfig.fromSchema()` to use schema fields directly
- Created migration helper `schemaFromChainConfig()` for backward compatibility
- Updated existing schemas (`testnet.ts`, `mainnet.ts` in chain-configs) to include required fields

**Key Files**:
- `src/global/chain-rules.ts` - Extended TypedHardforkSchema interface
- `src/global/global-config.ts` - Updated to use schema fields
- `src/builder.ts` - Migration helpers

---

### Phase 2: Added EIP Params to Schema ✅
**Status**: Complete

**Changes**:
- Created `EIPParamsSchema` type for EIP parameter definitions
- Added `eipParams?: EIPParamsSchema` field to `TypedHardforkSchema`
- Created type inference utilities in `fork-params/inferred-types.ts`
- Created parameter merging utilities in `fork-params/param-helpers.ts`
- Updated `HardforkParamManager` to merge schema EIP params with defaults
- Added documentation indicating Phase 5 migration path

**Key Files**:
- `src/global/chain-rules.ts` - Added EIPParamsSchema type and eipParams field
- `src/fork-params/inferred-types.ts` - Type inference utilities (NEW)
- `src/fork-params/param-helpers.ts` - Parameter merging utilities (NEW)
- `src/global/param-manager.ts` - Integrated schema EIP params
- `src/global/types.ts` - Added Phase 5 migration documentation
- `src/types.ts` - Added Phase 5 migration documentation

**Type Inference Utilities**:
- `InferEIPParams<E>` - Extracts params for specific EIP
- `InferEIPParamsMap` - Map of all EIP param types
- `InferChainParams` - Union of all params (simplified)
- `InferEIPParamKeys<E>` / `InferEIPParamType<E, K>` - Type-safe access

---

### Phase 3: Migrate Chain Definitions ✅
**Status**: Complete

#### ✅ Step 3.1: Created Schema Builder Utilities
- Created `schema-builders.ts` with helper functions
- `createSchemaFromChainConfig()` - Convert ChainConfig to schema
- `createMainnetSchema()`, `createTestnetSchema()` - Convenience functions
- `createCustomChainSchema()` - Helper for custom chains

#### ✅ Step 3.2: Migrated Chain Configs
- Created schema versions: `mainnetChainSchema`, `sepoliaChainSchema`, `holeskyChainSchema`
- Added deprecation warnings to old ChainConfig exports
- Old exports remain for backward compatibility

#### ✅ Step 3.3: Update Usage Sites
- Updated `init.ts` to accept schemas directly (prefers schema over ChainConfig)
- Updated `vm/src/requests.ts` to use schema-based access instead of hardcoded Mainnet
- Updated `scripts/sanity-check.ts` to use `createCustomChainSchema` directly
- Updated `execution-client/src/bin/test-network.ts` and `network-utils.ts` to use schemas
- All changes maintain backward compatibility

**Key Files**:
- `src/chains/schema-builders.ts` - Builder utilities (NEW)
- `src/chains/mainnet-schema.ts` - Mainnet schema (NEW)
- `src/chains/sepolia-schema.ts` - Sepolia schema (NEW)
- `src/chains/holesky-schema.ts` - Holesky schema (NEW)
- `src/chains/mainnet.ts` - Added deprecation warning
- `src/chains/sepolia.ts` - Added deprecation warning
- `src/chains/holesky.ts` - Added deprecation warning
- `src/setup/init.ts` - Updated to accept schemas

---

## 🔄 Remaining Work

### Phase 4: Remove ChainConfig Dependency ✅
**Status**: Complete

**Changes**:
- Removed `chain?: ChainConfig` from `TypedHardforkSchema` interface
- Removed `chain?: ChainConfig` from `createHardforkSchema` function parameters
- Updated `GlobalConfig.fromSchema()` to always create ChainConfig from schema fields (no fallback)
- Removed `chain:` assignments from `schemaFromChainConfig()` and `chain-configs/mainnet.ts`
- Schema is now the single source of truth - ChainConfig is only created for backward compatibility with code that accesses `config.chain`

**Key Files**:
- `src/global/chain-rules.ts` - Removed chain field from TypedHardforkSchema
- `src/global/global-config.ts` - Always creates chain from schema fields
- `src/builder.ts` - Removed chain assignment from schemaFromChainConfig
- `src/chains/chain-configs/mainnet.ts` - Removed chain field

**Note**: `ChainConfig` type still exists and `config.chain` is still populated for backward compatibility, but schemas no longer depend on it.

---

### Phase 5: Full Type Inference
**Status**: Complete ✅

**Changes**:
- Replaced `EIPParamsMap` with `InferEIPParamsMap` in `src/global/types.ts`.
- Replaced all `EIP*Params` interfaces in `src/types.ts` with type aliases using `InferEIPParams<numeric>` (e.g., `InferEIPParams<1559>`).
- Replaced `ChainParams` with `InferChainParams`.
- Updated hardfork-specific param types (e.g., `HomesteadParams`, `BerlinParams`) to use inferred types.
- Removed all manual interface definitions (previously lines 187-605).
- All types are now automatically inferred from `chainForkParams` in `fork-params/default-params.ts`.

**Key Files**:
- `src/types.ts` - All EIP*Params are now type aliases
- `src/global/types.ts` - Uses InferEIPParamsMap
- `src/fork-params/inferred-types.ts` - Type inference utilities

**Key Insight**: All types are now inferred from `chainForkParams` in `fork-params/default-params.ts`, ensuring types stay in sync with the single source of truth.

---

## 📁 Key File Reference

### Core Schema Files
- `src/global/chain-rules.ts` - Schema definitions and types
- `src/global/global-config.ts` - Main config class using schemas
- `src/global/param-manager.ts` - Parameter management with schema support

### Type Inference
- `src/fork-params/inferred-types.ts` - Type inference utilities
- `src/fork-params/default-params.ts` - Single source of truth for EIP params
- `src/fork-params/param-helpers.ts` - Parameter merging utilities

### Chain Definitions
- `src/chains/mainnet-schema.ts` - Mainnet schema (NEW, preferred)
- `src/chains/sepolia-schema.ts` - Sepolia schema (NEW, preferred)
- `src/chains/holesky-schema.ts` - Holesky schema (NEW, preferred)
- `src/chains/mainnet.ts` - Mainnet ChainConfig (deprecated)
- `src/chains/sepolia.ts` - Sepolia ChainConfig (deprecated)
- `src/chains/holesky.ts` - Holesky ChainConfig (deprecated)

### Migration Helpers
- `src/builder.ts` - Migration utilities (`schemaFromChainConfig`, etc.)
- `src/chains/schema-builders.ts` - Schema builder utilities

---

## 🏗️ Architecture Overview

### Current State (Phase 4)
```
┌─────────────────────────────────────────┐
│  TypedHardforkSchema                    │
│  ├─ ChainConfig fields (name, genesis)  │
│  └─ eipParams?: EIPParamsSchema         │
└─────────────────────────────────────────┘
           │
           └─→ GlobalConfig.fromSchema()
               ├─→ Creates ChainConfig from schema (backward compat)
               └─→ HardforkParamManager
                   └─→ Merges eipParams + defaults
```

### Target State (Phase 5)
```
┌─────────────────────────────────────────┐
│  TypedHardforkSchema                    │
│  ├─ ChainConfig fields                  │
│  └─ eipParams?: EIPParamsSchema         │
└─────────────────────────────────────────┘
           │
           └─→ All types inferred from chainForkParams
               └─→ No manual interfaces needed
```

---

## 🔑 Key Concepts

### EIPParamsSchema
Type for defining EIP parameters in schema:
```typescript
type EIPParamsSchema = {
  readonly [K in EIP]?: Readonly<Record<string, bigint | number | null>>
}
```

### Parameter Merging
- Schema `eipParams` merge with `chainForkParams` defaults
- Schema params override defaults when provided
- Handled by `getEffectiveEIPParams()` in `param-helpers.ts`

### Type Inference Flow
1. `chainForkParams` in `default-params.ts` is the source of truth
2. `InferEIPParams<E>` extracts type for specific EIP
3. `InferEIPParamsMap` creates map of all EIP types
4. `InferChainParams` creates union of all params

---

## 📝 Usage Examples

### Current (Schema-First, Preferred)
```typescript
import { mainnetChainSchema } from '@ts-ethereum/chain-config/chains'
import { GlobalConfig } from '@ts-ethereum/chain-config'

const config = GlobalConfig.fromSchema({
  schema: mainnetChainSchema,
  hardfork: Hardfork.Prague,
})
```

### Legacy (Still Works, Deprecated)
```typescript
import { Mainnet } from '@ts-ethereum/chain-config/chains'
import { schemaFromChainConfig } from '@ts-ethereum/chain-config'

const schema = schemaFromChainConfig(Mainnet)
const config = GlobalConfig.fromSchema({ schema })
```

### Custom Schema with EIP Params
```typescript
import { createHardforkSchema, hardforkEntry } from '@ts-ethereum/chain-config'
import { EIP, Hardfork } from '@ts-ethereum/chain-config'

const customSchema = createHardforkSchema({
  hardforks: [
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),
    hardforkEntry(Hardfork.London, { block: 100n }),
  ],
  chainId: 999n,
  name: 'custom-testnet',
  genesis: { /* ... */ },
  bootstrapNodes: [],
  consensus: { type: 'pow', algorithm: 'ethash' },
  eipParams: {
    [EIP.EIP_1559]: {
      elasticityMultiplier: 3n, // Overrides default 2n
      // ... other params
    }
  }
})
```

---

## 🎯 Next Steps for New Agent

1. **Complete Phase 3, Step 3.3**: Update usage sites
   - Check `src/setup/init.ts` - update to prefer schemas
   - Search for other ChainConfig usages
   - Update to use schemas where possible

2. **Test Compatibility**: Ensure all existing code still works
   - Run tests
   - Verify backward compatibility

3. **Documentation**: Update README/examples with schema-first approach

4. **Phase 4 Preparation**: Plan removal of ChainConfig dependency

---

## 🔍 Important Notes

- **Backward Compatibility**: All changes maintain backward compatibility
- **Deprecation Warnings**: Old APIs are marked deprecated but still work
- **Type Safety**: All type inference maintains compile-time safety
- **Single Source of Truth**: `chainForkParams` in `default-params.ts` is the source
- **Incremental Migration**: Each phase is independent and testable

---

## 📊 Migration Checklist

- [x] Phase 1: Extended schema with ChainConfig fields
- [x] Phase 2: Added EIP params to schema
- [x] Phase 2: Created type inference utilities
- [x] Phase 2: Integrated schema params with param manager
- [x] Phase 3: Created schema builder utilities
- [x] Phase 3: Migrated chain configs to schemas
- [x] Phase 3: Update usage sites
- [x] Phase 4: Remove ChainConfig dependency
- [x] Phase 5: Full type inference (remove manual interfaces)

---

## 🐛 Known Issues / Considerations

- `chain-configs/mainnet.ts` has a `mainnetSchema` export that conflicts with new `mainnetChainSchema`
  - Resolved by renaming new schemas to `*ChainSchema`
- Type inference from `chainForkParams` works but needs `as const` for better inference
  - Currently uses `ParamsDict` type which loses literal types
  - Phase 5 will improve this

---

## 💡 Tips for Continuing

1. **Read the code**: The implementation is well-documented with Phase markers
2. **Test incrementally**: Each change should pass TypeScript checks (`bun run check`)
3. **Maintain compatibility**: Old code should continue working
4. **Use grep**: Search for `ChainConfig`, `schemaFromChainConfig` to find usage sites
5. **Check tests**: Look for test files that use ChainConfig

---

## 🔗 Related Files to Review

When continuing, start by reading these files in order:

1. `src/global/chain-rules.ts` - Understand schema structure
2. `src/fork-params/inferred-types.ts` - Understand type inference
3. `src/chains/mainnet-schema.ts` - Example schema definition
4. `src/setup/init.ts` - Usage site to update
5. `src/builder.ts` - Migration helpers

---

**Last Updated**: After Phase 4 (Complete)
**Next Step**: Phase 5 - Full Type Inference

**To continue**: Replace all manual EIP param interfaces with inferred types from `chainForkParams`.

