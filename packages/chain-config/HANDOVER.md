# Quick Handover Guide

## 🎯 Current Status
**Phase 5** - Full Type Inference

## 📋 What's Done
- ✅ Schema infrastructure complete
- ✅ Type inference utilities ready
- ✅ Chain schemas created (`mainnetChainSchema`, `sepoliaChainSchema`, `holeskyChainSchema`)
- ✅ Deprecation warnings added to old ChainConfig exports
- ✅ Usage sites updated to prefer schemas
- ✅ ChainConfig dependency removed from schemas (schemas are now self-contained)

## 🔧 What's Next
Replace all manual EIP param interfaces with inferred types from `chainForkParams`.

## 🔍 Quick Commands

```bash
# Find ChainConfig usages
cd packages/chain-config
grep -r "import.*Mainnet\|import.*Sepolia\|import.*Holesky" ../../
grep -r "schemaFromChainConfig" ../../
grep -r "from.*chains.*mainnet\|from.*chains.*sepolia" ../../

# Check TypeScript
bun run check
```

## 📁 Key Files

**Read First**:
1. `MIGRATION_PROGRESS.md` - Full migration details
2. `src/global/chain-rules.ts` - Schema structure
3. `src/fork-params/inferred-types.ts` - Type inference
4. `src/chains/mainnet-schema.ts` - Example schema

**Update These**:
- `src/setup/init.ts` - Currently uses `schemaFromChainConfig(chainConfig)`

## 💡 Quick Reference

### New Way (Preferred)
```typescript
import { mainnetChainSchema } from '@ts-ethereum/chain-config/chains'
const config = GlobalConfig.fromSchema({ schema: mainnetChainSchema })
```

### Old Way (Still Works, Deprecated)
```typescript
import { Mainnet } from '@ts-ethereum/chain-config/chains'
const schema = schemaFromChainConfig(Mainnet)
const config = GlobalConfig.fromSchema({ schema })
```

## ✅ Testing
After changes, run:
```bash
cd packages/chain-config
bun run check  # TypeScript check
```

## 📖 Full Details
See `MIGRATION_PROGRESS.md` for complete context.

