// src/kademlia/index.ts
// Ethereum-compatible Kademlia DHT for peer discovery

// Main exports
export { BanList } from './ban-list'
export { KBucket } from './bucket'
export {
	createKademlia, Kademlia, KademliaNode, type KademliaNodeConfig
} from './kademlia'
export { RoutingTable, type RoutingTableEvent } from './routing-table'
export { UdpKademliaTransport, UdpTransport } from './udp'

// Message encoding
export {
	decode, encode, MessageTypes,
	type DecodedMessage, type FindNeighboursData, type MessageTypeName, type NeighboursData, type PingData,
	type PongData
} from './message'

// XOR utilities
export {
	bucketIndex,
	bucketIndexFromDistance, distance, hashToId, id2pk, pk2id, xor,
	xorDistance,
	xorDistanceBigInt, zfill
} from './xor'

// Types
export {
	createDeferred,
	// Constants
	DISCOVERY_VERSION, getPeerKeys, type Contact,
	// Utilities
	type Deferred,
	// Config types
	type KademliaConfig,
	// Event types
	type KademliaEvent,
	// Transport interface
	type KademliaTransport, type KademliaTransportEvent, type KademliaTransportOptions, type KBucketEvent, type KBucketOptions,
	// Peer types
	type PeerInfo, type RoutingTableConfig,
	type RoutingTableDump
} from './types'

