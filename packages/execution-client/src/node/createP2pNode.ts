import { defaultLogger } from '@libp2p/logger'
import { P2PNode, P2PNode as P2PNodeType, rlpx } from '@ts-ethereum/p2p'
import { ConfigOptions } from '../config/types'
import { dptDiscovery } from '../net/discovery/dpt-discovery'
import { ETH } from '../net/protocol/eth/eth'

export function createP2PNodeFromConfig(options: ConfigOptions): P2PNodeType {
  const kadDiscovery = []
  const componentLogger = defaultLogger()

  if (options.discV4) {
    kadDiscovery.push(
      dptDiscovery({
        privateKey: options.key as any,
        bindAddr: options.extIP ?? '127.0.0.1',
        bindPort: options.port,
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
      listen: [
        options.extIP
          ? `/ip4/${options.extIP}/tcp/${options.port}`
          : `/ip4/0.0.0.0/tcp/${options.port}`,
      ],
    },
    transports: [
      rlpx({
        privateKey: options.key as any,
        capabilities: [ETH.eth68],
        common: options.common,
        timeout: 10000,
        maxConnections: options.maxPeers,
      }),
    ] as any,
  })

  return node
}
