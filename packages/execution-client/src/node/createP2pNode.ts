import { defaultLogger } from '@libp2p/logger'
import { P2PNode, type P2PNode as P2PNodeType, rlpx } from '@ts-ethereum/p2p'
import type { ConfigOptions } from '../config/types'
import { dptDiscovery } from '../net/discovery/dpt-discovery'
import { ETH } from '../net/protocol/eth/eth'

export function createP2PNodeFromConfig(options: ConfigOptions): P2PNodeType {
  const kadDiscovery = []
  const componentLogger = defaultLogger()

  // extIP is used for binding/listening (0.0.0.0 for Docker)
  // announceIP is used for advertising to peers (container IP for Docker)
  const listenIP = options.extIP ?? '0.0.0.0'
  const announceIP = options.announceIP ?? options.extIP ?? '127.0.0.1'

  if (options.discV4) {
    kadDiscovery.push(
      dptDiscovery({
        privateKey: options.key as any,
        bindAddr: listenIP,
        bindPort: options.port,
        announceAddr: announceIP, // Advertise this IP to peers
        bootstrapNodes: [...(options.bootnodes as any)],
        autoDial: true,
        autoDialBootstrap: true,
      }),
    )
  }

  const node = new P2PNode({
    privateKey: options.key as any,
    peerDiscovery: kadDiscovery,
    maxConnections: options.maxPeers,
    logger: componentLogger,
    addresses: {
      // Listen on all interfaces (or specified IP)
      listen: [`/ip4/${listenIP}/tcp/${options.port}`],
      // Announce with the routable IP
      announce: [`/ip4/${announceIP}/tcp/${options.port}`],
    },
    transports: [
      rlpx({
        privateKey: options.key as any,
        capabilities: [ETH.eth68],
        common: options.hardforkManager ?? options.common!,
        timeout: 10000,
        maxConnections: options.maxPeers,
      }),
    ] as any,
  })

  return node
}
