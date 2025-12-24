# DPT Discovery - libp2p Compatibility Guide

## Overview

Your `DPTDiscovery` module is **mostly compatible** with libp2p's peer discovery interface, but requires a small adapter to work seamlessly with `createLibp2p`.

## Compatibility Analysis

### ✅ What's Already Compatible

Your `DPTDiscovery` class already implements most of what libp2p needs:

1. **Event Emission**: Emits `peer` events with `CustomEvent<PeerInfo>` ✓
2. **Lifecycle Methods**: Has `start()` and `stop()` methods ✓
3. **Symbol Support**: Has `[peerDiscoverySymbol]` and `[Symbol.toStringTag]` ✓
4. **PeerInfo Format**: Uses `{id, multiaddrs}` format that libp2p expects ✓

### ❌ What's Missing for Full libp2p Compatibility

1. **`[serviceCapabilities]` property**: Required by libp2p to identify the module
2. **`Startable` interface**: Should implement `isStarted()` method (you have it, but need to match interface)
3. **Component Types**: Uses custom `P2PNodeComponents` instead of libp2p's component types
4. **Factory Function**: Returns function that takes custom components instead of libp2p components

## Solution: Use the Adapter

A libp2p-compatible adapter (`DPTDiscoveryLibp2p`) has been created that wraps your `DPTDiscovery` and adds the missing libp2p requirements.

## Usage Examples

### Option 1: Using the Adapter (Recommended)

```typescript
import { createLibp2p } from 'libp2p'
import { dptDiscoveryLibp2p } from './net/discovery/dpt-discovery-libp2p'
import { rlpx } from '@ts-ethereum/p2p/transport/rlpx-libp2p'

const node = await createLibp2p({
  privateKey: yourPrivateKey,
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/30303'],
  },
  transports: [
    rlpx({
      privateKey: yourRlpxKey,
      // ... other options
    }),
  ],
  peerDiscovery: [
    dptDiscoveryLibp2p({
      privateKey: yourRlpxKey,
      bindAddr: '0.0.0.0',
      bindPort: 30303,
      bootstrapNodes: [
        {
          id: bootstrapPeerId,
          address: '1.2.3.4',
          udpPort: 30303,
          tcpPort: 30303,
        },
      ],
      autoDial: false, // Let libp2p handle dialing
      autoDialBootstrap: true,
    }),
  ],
})

// Listen for discovered peers
node.addEventListener('peer:discovery', (evt) => {
  const { id, multiaddrs } = evt.detail
  console.log(`Discovered peer: ${id.toString()}`)
  console.log(`Addresses: ${multiaddrs.map(m => m.toString()).join(', ')}`)
  
  // Optionally dial the peer
  // node.dial(multiaddrs).catch(err => console.error('Dial failed:', err))
})
```

### Option 2: Direct Usage (with type casting)

If you want to use your existing `dptDiscovery` factory directly, you can cast it:

```typescript
import { createLibp2p } from 'libp2p'
import { dptDiscovery } from './net/discovery/dpt-discovery'

const node = await createLibp2p({
  // ... other config
  peerDiscovery: [
    dptDiscovery({
      privateKey: yourRlpxKey,
      bindPort: 30303,
      bootstrapNodes: [...],
    }) as any, // Type cast to bypass component type mismatch
  ],
})
```

**Note**: This works but may have type issues. The adapter is recommended.

## How the Adapter Works

The `DPTDiscoveryLibp2p` adapter:

1. **Implements libp2p interfaces**: 
   - `PeerDiscovery` from `@libp2p/interface`
   - `Startable` interface with `isStarted()` method
   - Adds `[serviceCapabilities]` property

2. **Converts components**: 
   - Takes libp2p's `ComponentLogger` and `ConnectionManager`
   - Converts them to `DPTDiscovery`'s expected format

3. **Forwards events**: 
   - Listens to `DPTDiscovery`'s `peer` events
   - Re-emits them in libp2p's expected format

4. **Delegates lifecycle**: 
   - `start()` and `stop()` methods delegate to underlying `DPTDiscovery`

## Key Differences: Your Custom P2P vs libp2p

| Aspect | Your Custom P2P | libp2p |
|--------|----------------|--------|
| Components | `P2PNodeComponents` | `@libp2p/interface-internal` types |
| Event Target | `TypedEventEmitter` from `main-event` | `TypedEventEmitter` from `@libp2p/interface` |
| Peer Discovery Symbol | Custom `peerDiscoverySymbol` | `peerDiscoverySymbol` from `@libp2p/interface` |
| Service Capabilities | Not required | Required `[serviceCapabilities]` |

## Integration Checklist

- [x] Create libp2p adapter wrapper
- [x] Implement `Startable` interface
- [x] Add `[serviceCapabilities]` property
- [x] Convert component types
- [x] Forward events correctly
- [ ] Test with `createLibp2p`
- [ ] Update exports/index if needed

## Testing

To test the integration:

```typescript
// test-dpt-libp2p.ts
import { createLibp2p } from 'libp2p'
import { dptDiscoveryLibp2p } from './net/discovery/dpt-discovery-libp2p'

async function test() {
  const node = await createLibp2p({
    privateKey: generatePrivateKey(),
    peerDiscovery: [
      dptDiscoveryLibp2p({
        privateKey: generatePrivateKey(),
        bindPort: 30303,
      }),
    ],
  })

  node.addEventListener('peer:discovery', (evt) => {
    console.log('✅ Peer discovered:', evt.detail.id.toString())
  })

  await node.start()
  console.log('✅ Node started')
}
```

## References

- [libp2p Peer Discovery Interface](https://www.npmjs.com/package/@libp2p/interface-peer-discovery)
- [libp2p mdns Example](https://libp2p.github.io/js-libp2p-mdns/) - Good reference for interface implementation
- [libp2p Bootstrap Example](https://libp2p.github.io/js-libp2p-bootstrap/) - Shows factory function pattern

