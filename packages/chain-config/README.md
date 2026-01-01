# @ts-ethereum/chain-config

Chain configuration and hardfork parameter management for the ts-ethereum execution client.

## Overview

This package provides the foundational configuration layer for the entire blockchain client. It handles:

- **Hardfork definitions** - The canonical ordering of Ethereum hardforks (chainstart through osaka and beyond)
- **EIP parameter management** - Gas costs, limits, and protocol constants introduced by each EIP
- **Chain schemas** - Type-safe definitions of chain configurations including genesis, hardfork transitions, and consensus settings
- **Runtime configuration** - The `GlobalConfig` class that other packages use to query active parameters

## How It Fits Into the Stack

The chain-config package sits at the base of the dependency tree. Nearly every other package depends on it:

```
                    chain-config
                         |
        +----------------+----------------+
        |                |                |
       evm              vm            blockchain
        |                |                |
        +-------+--------+                |
                |                         |
           state-manager                  |
                |                         |
                +-----------+-------------+
                            |
                    execution-client
```

- **evm** uses chain-config to look up opcode gas costs and check which EIPs are active
- **vm** queries hardfork-specific block validation rules
- **blockchain** uses it for fork hash calculations and hardfork transition logic
- **state-manager** needs gas parameters for storage operations
- **execution-client** creates the GlobalConfig instance and passes it to all subsystems

## Package Structure

```
src/
  config/
    global-config.ts   # Main GlobalConfig class
    param-manager.ts   # ParamsManager for EIP parameter resolution
    types.ts           # Type definitions for config options
  hardforks/
    hardforks.ts       # Hardfork ordering and EIP mappings
    eips.ts            # EIP number constants
    params.ts          # Parameter values for each EIP
  chains/
    schema.ts          # Helper functions for schema creation
    presets/           # Mainnet, Sepolia, Holesky, etc.
  genesis/
    gethGenesis.ts     # Parse geth-style genesis files
    types.ts           # Genesis state types
  network/
    accounts.ts        # Account management utilities
    bootnodes.ts       # Bootnode parsing
    keys.ts            # Key file handling
  builder.ts           # Factory functions for creating configs
  types.ts             # Core type definitions
```

## Key Concepts

### Hardfork Ordering

Hardforks are defined in a strict order. Each hardfork introduces a set of EIPs:

```typescript
export const HARDFORK_ORDER = [
  'chainstart',
  'homestead',
  'dao',
  'tangerineWhistle',
  'spuriousDragon',
  'byzantium',
  'constantinople',
  'petersburg',
  'istanbul',
  'muirGlacier',
  'berlin',
  'london',
  'arrowGlacier',
  'grayGlacier',
  'paris',
  'mergeNetsplitBlock',
  'shanghai',
  'cancun',
  'prague',
  'osaka',
  // ...
] as const
```

### EIP Parameters

Each EIP defines its parameters as a const object. These get layered on top of each other as you move through the hardfork sequence:

```typescript
// Base parameters from EIP-1
export const EIP1_PARAMS = {
  txGas: 21000n,
  callGas: 40n,
  sloadGas: 50n,
  // ...
}

// EIP-2929 modifies gas costs for state access
export const EIP2929_PARAMS = {
  coldsloadGas: 2100n,
  warmstoragereadGas: 100n,
  sloadGas: 0n,  // Now uses cold/warm distinction
  // ...
}
```

### Parameter Resolution

When you ask for a parameter value, the ParamsManager walks through all EIPs active at the current hardfork and returns the most recent value:

1. Start with EIP-1 base values
2. Apply each hardfork's EIP changes in order
3. Apply any runtime overrides

### Block vs Timestamp Activation

Pre-merge hardforks activate at specific block numbers. Post-merge hardforks (Paris and later) activate at timestamps:

```typescript
hardforkEntry(Hardfork.London, { block: 12965000n }),
hardforkEntry(Hardfork.Paris, { block: null, timestamp: '1681338455' }),
```

## Usage

### Defining a Chain Schema

To define a custom chain, create a hardfork schema with your desired fork schedule:

```typescript
import {
  createHardforkSchema,
  hardforkEntry,
  Hardfork,
} from '@ts-ethereum/chain-config'

const myChainSchema = createHardforkSchema({
  hardforks: [
    // All chains start with chainstart at block 0
    hardforkEntry(Hardfork.Chainstart, { block: 0n }),

    // For testnets, you might activate everything at genesis
    hardforkEntry(Hardfork.Homestead, { block: 0n }),
    hardforkEntry(Hardfork.TangerineWhistle, { block: 0n }),
    hardforkEntry(Hardfork.SpuriousDragon, { block: 0n }),
    hardforkEntry(Hardfork.Byzantium, { block: 0n }),
    hardforkEntry(Hardfork.Constantinople, { block: 0n }),
    hardforkEntry(Hardfork.Petersburg, { block: 0n }),
    hardforkEntry(Hardfork.Istanbul, { block: 0n }),
    hardforkEntry(Hardfork.Berlin, { block: 0n }),
    hardforkEntry(Hardfork.London, { block: 0n }),

    // Post-merge forks use timestamps
    hardforkEntry(Hardfork.Paris, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Shanghai, { block: null, timestamp: '0' }),
    hardforkEntry(Hardfork.Cancun, { block: null, timestamp: '0' }),
  ] as const,
  chainId: 31337n,
})
```

### Creating a GlobalConfig Instance

Once you have a schema, create a GlobalConfig to use throughout your application:

```typescript
import { GlobalConfig, Hardfork } from '@ts-ethereum/chain-config'

const common = GlobalConfig.fromSchema({
  schema: myChainSchema,
  hardfork: Hardfork.Cancun,
})

// Query parameters
const txGas = common.getParam('txGas')           // 21000n
const chainId = common.chainId()                  // 31337n

// Check EIP activation
const hasEIP1559 = common.isActivatedEIP(1559)   // true (active since London)

// Switch hardforks at runtime
common.setHardfork(Hardfork.Berlin)
const hasEIP1559Now = common.isActivatedEIP(1559) // false (London not yet active)
```

### Using a ChainConfig Object

If you have a full ChainConfig object (like from a genesis file), use the builder functions:

```typescript
import {
  schemaFromChainConfig,
  GlobalConfig,
  Hardfork,
  type ChainConfig,
} from '@ts-ethereum/chain-config'

const chainConfig: ChainConfig = {
  name: 'my-testnet',
  chainId: 12345n,
  defaultHardfork: 'cancun',
  consensus: {
    type: 'pow',
    algorithm: 'ethash',
  },
  genesis: {
    gasLimit: 10485760,
    difficulty: 1,
    nonce: '0x0000000000000000',
    extraData: '0x',
  },
  hardforks: [
    { name: 'chainstart', block: 0n },
    { name: 'homestead', block: 0n },
    // ... other hardforks
    { name: 'cancun', block: null, timestamp: '0' },
  ],
  bootstrapNodes: [],
}

const schema = schemaFromChainConfig(chainConfig)
const common = GlobalConfig.fromSchema({
  schema,
  hardfork: Hardfork.Cancun,
})
```

### Overriding Parameters

You can override specific parameters at creation time or runtime:

```typescript
// At creation time
const common = GlobalConfig.fromSchema({
  schema: myChainSchema,
  hardfork: Hardfork.Cancun,
  overrides: {
    txGas: 25000n,  // Custom tx gas cost
  },
})

// At runtime
common.updateParams({
  targetBlobGasPerBlock: 524288n,
})
```

### Parsing Geth Genesis Files

To create a config from a geth-style genesis.json:

```typescript
import {
  createCommonFromGethGenesis,
  parseGethGenesisState,
} from '@ts-ethereum/chain-config'

const genesisJSON = {
  config: {
    chainId: 12345,
    homesteadBlock: 0,
    eip155Block: 0,
    // ...
  },
  difficulty: '0x1',
  gasLimit: '0x1000000',
  nonce: '0x0000000000000000',
  alloc: {
    '0x...': { balance: '1000000000000000000000' },
  },
}

const common = createCommonFromGethGenesis(genesisJSON, {
  chain: 'my-chain',
})

const genesisState = parseGethGenesisState(genesisJSON)
```

## Preset Chains

The package includes configurations for mainnet and testnets:

```typescript
import {
  Mainnet,
  Sepolia,
  Holesky,
  Hoodi,
  getPresetChainConfig,
} from '@ts-ethereum/chain-config'

// Get by name or chain ID
const mainnet = getPresetChainConfig('mainnet')
const sepolia = getPresetChainConfig(11155111)
```

## API Reference

### GlobalConfig

| Method | Description |
|--------|-------------|
| `fromSchema(opts)` | Create instance from a typed schema |
| `chainId()` | Get the chain ID |
| `hardfork()` | Get the current hardfork name |
| `setHardfork(hf)` | Switch to a different hardfork |
| `getParam(name)` | Get a parameter value |
| `isActivatedEIP(eip)` | Check if an EIP is active |
| `gteHardfork(hf)` | Check if current hardfork is >= target |
| `getHardforkBy({ blockNumber, timestamp })` | Find hardfork for block/time |
| `hardforkBlock(hf)` | Get block number for a hardfork |
| `forkHash(hf, genesisHash)` | Calculate EIP-2124 fork hash |
| `copy()` | Create a deep copy |

### ParamsManager

| Method | Description |
|--------|-------------|
| `getParam(name)` | Get parameter by name |
| `getParamByEIP(eip, param)` | Get specific EIP parameter |
| `isEIPActive(eip)` | Check if EIP is active |
| `updateParams(overrides)` | Apply parameter overrides |
| `withHardfork(hf)` | Create new manager at different hardfork |