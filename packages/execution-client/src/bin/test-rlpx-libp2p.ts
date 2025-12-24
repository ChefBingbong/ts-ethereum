#!/usr/bin/env node

import { generateKeyPair } from '@libp2p/crypto/keys'
import { multiaddr } from '@multiformats/multiaddr'
import { Common } from '@ts-ethereum/chain-config'
import { RLPxConnectionAdapter, rlpxLibp2p } from '@ts-ethereum/p2p'
import { bigIntToBytes } from '@ts-ethereum/utils'
import debug from 'debug'
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import { createLibp2p, type Libp2p } from 'libp2p'
import { dptDiscoveryLibp2p } from '../net/discovery/dpt-discovery-libp2p'
import { ETH } from '../net/protocol/eth/eth'

debug.enable('p2p:*')

function getNodeIdFromPrivateKey(privateKey: { raw: Uint8Array }): Uint8Array {
  const rawKey = privateKey.raw.length === 32 ? privateKey.raw : privateKey.raw.slice(-32)
  return secp256k1.getPublicKey(rawKey, false).slice(1)
}

function findRLPxListener(node: Libp2p): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transportManager = (node as any).components?.transportManager
  if (!transportManager) return null

  const transports = (transportManager as any).transports
  const rlpxTransport = Array.from(transports.values()).find(
    (t: any) => t[Symbol.toStringTag] === '@libp2p/rlpx',
  ) as any
  const transportListener = rlpxTransport?._listener
  if (transportListener && typeof transportListener.getConnections === 'function') {
    return transportListener
  }

  const listeners = (transportManager as any).listeners
  if (listeners) {
    for (const [, value] of listeners.entries()) {
      let listener = (value as any).listener || value
      // Check for nested Map/object structure
      if (listener?.get && typeof listener.get === 'function') {
        listener = listener.get('0') || listener.get(0)
      } else if (listener?.['0']) {
        listener = listener['0']
      }
      if (listener && typeof listener.getConnections === 'function') {
        return listener
      }
    }
  }
  return null
}

function checkStatusMessage(ethProtocol: ETH): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerStatus = (ethProtocol as any)._peerStatus
  if (!peerStatus) {
    console.log('⚠️  Status message not received')
    return
  }

  console.log('✅ Received ETH status message!')
  if (typeof (ethProtocol as any).getPeerStatus === 'function') {
    const decoded = (ethProtocol as any).getPeerStatus()
    console.log('Decoded:', decoded)
  }
}

export async function runTwoNodeExample(): Promise<void> {
  console.log('=== RLPX Transport Test: Two Nodes with ETH/68 ===\n')

  // Generate keys
  const node1Key = await generateKeyPair('secp256k1')
  const node2Key = await generateKeyPair('secp256k1')
  const node1Id = getNodeIdFromPrivateKey(node1Key)
  const node2Id = getNodeIdFromPrivateKey(node2Key)
  const node1RlpxKey = node1Key.raw.length === 32 ? node1Key.raw : node1Key.raw.slice(-32)
  const node2RlpxKey = node2Key.raw.length === 32 ? node2Key.raw : node2Key.raw.slice(-32)

  // Setup Common
  const common = new Common({
    chain: {
      name: 'testnet',
      chainId: 1,
      genesis: { gasLimit: 5000, difficulty: '0x10', nonce: '0x0000000000000000', extraData: '0x' },
      hardforks: [],
      bootstrapNodes: [],
      consensus: { type: 'pow', algorithm: 'ethash' },
    },
    params: {
      minGasLimit: 5000,
      gasLimitBoundDivisor: 1024,
      maxExtraDataSize: 32,
      minimumDifficulty: 10,
      difficultyBoundDivisor: 2048,
      durationLimit: 13,
    },
  } as any)

  const port1 = 30303
  const port2 = 30304

  // Create nodes
  const node1 = await createLibp2p({
    privateKey: node1Key,
    addresses: { listen: [`/ip4/127.0.0.1/tcp/${port1}`], announce: [] },
    transports: [
      rlpxLibp2p({
        privateKey: node1RlpxKey,
        capabilities: [ETH.eth68],
        common,
        timeout: 20000,
        maxConnections: 25,
        backlog: 5,
        closeServerOnMaxConnections: { closeAbove: 25, listenBelow: 20 },
      }),
    ],
    peerDiscovery: [
      dptDiscoveryLibp2p({
        privateKey: node1RlpxKey,
        bindAddr: '127.0.0.1',
        bindPort: port1,
        bootstrapNodes: [],
        autoDial: false,
        autoDialBootstrap: false,
      }),
    ],
  })

  const node2 = await createLibp2p({
    privateKey: node2Key,
    addresses: { listen: [`/ip4/127.0.0.1/tcp/${port2}`], announce: [] },
    transports: [
      rlpxLibp2p({
        privateKey: node2RlpxKey,
        capabilities: [ETH.eth68],
        common,
        timeout: 20000,
        maxConnections: 25,
        backlog: 5,
        closeServerOnMaxConnections: { closeAbove: 25, listenBelow: 20 },
      }),
    ],
    peerDiscovery: [
      dptDiscoveryLibp2p({
        privateKey: node2RlpxKey,
        bindAddr: '127.0.0.1',
        bindPort: port2,
        bootstrapNodes: [{ id: node1Id, address: '127.0.0.1', udpPort: port1, tcpPort: port1 }],
        autoDial: false,
        autoDialBootstrap: false,
      }),
    ],
  })

  // Start nodes
  await Promise.all([node1.start(), node2.start()])
  console.log('Nodes started')
  console.log('Node 1:', node1.getMultiaddrs()[0].toString())
  console.log('Node 2:', node2.getMultiaddrs()[0].toString())
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Node 1 dials Node 2
  console.log('\nNode 1 dialing Node 2...')
  const transportManager = (node1 as any).components?.transportManager
  const rlpxTransport = Array.from((transportManager as any).transports.values()).find(
    (t: any) => t[Symbol.toStringTag] === '@libp2p/rlpx',
  )

  const node2Addr = multiaddr(node2.getMultiaddrs()[0].toString().split('/p2p/')[0])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = await (rlpxTransport as any).dial(node2Addr, {
    remoteId: node2Id,
    onProgress: (event: any) => console.log(`  Progress: ${event.type || event.detail?.type}`),
  })

  console.log('✅ Connected!')

  // Send status message from Node 1
  if (connection instanceof RLPxConnectionAdapter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProtocol = connection.getProtocols().find((p: any) => p instanceof ETH) as ETH | undefined
    if (ethProtocol) {
      ethProtocol.sendStatus({
        td: bigIntToBytes(BigInt(0)),
        bestHash: new Uint8Array(32),
        genesisHash: new Uint8Array(32),
      })
      console.log('✅ Status message sent')
    }
  }

  // Check Node 2 for received status
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log('\nChecking Node 2 for received status...')

  const listener = findRLPxListener(node2)
  if (listener) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections = (listener as any).getConnections()
    if (connections.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const protocols = (connections[0] as any).getProtocols?.() || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethProtocol = protocols.find((p: any) => p instanceof ETH) as ETH | undefined
      if (ethProtocol) {
        checkStatusMessage(ethProtocol)
      }
    }
  }

  // Cleanup
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await Promise.all([node1.stop(), node2.stop()])
  console.log('\n✅ Test complete')
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('test-rlpx-libp2p.ts')) {
  runTwoNodeExample().catch((err) => {
    console.error('Test failed:', err)
    process.exit(1)
  })
}
