/**
 * Simplified libp2p-style P2P networking stack
 *
 * This module provides a simplified P2P node implementation inspired by libp2p,
 * tailored for Ethereum-style RLPx connections.
 *
 * @example
 * ```typescript
 * import { createP2PNode, rlpx } from './p2p/libp2p'
 *
 * const node = await createP2PNode({
 *   privateKey: myPrivateKey,
 *   addresses: {
 *     listen: ['/ip4/0.0.0.0/tcp/30303']
 *   },
 *   transports: [
 *     rlpx({
 *       privateKey: myPrivateKey,
 *       capabilities: [ETH.eth68],
 *       common: myCommon,
 *     })
 *   ]
 * })
 *
 * await node.start()
 *
 * // Listen for peer connections
 * node.addEventListener('peer:connect', (evt) => {
 *   console.log('Peer connected:', evt.detail)
 * })
 *
 * // Register a topology for protocol notifications
 * node.register('/eth/68', {
 *   onConnect: (peerId, connection) => {
 *     console.log('ETH peer connected:', peerId)
 *   },
 *   onDisconnect: (peerId) => {
 *     console.log('ETH peer disconnected:', peerId)
 *   }
 * })
 *
 * // Dial a peer
 * const connection = await node.dial(peerMultiaddr, { remoteId: peerNodeId })
 * ```
 */

// Address manager
export {
	AddressManager,
	createAddressManager,
	type AddressManagerComponents,
	type AddressManagerInit,
} from "./address-manager.ts";
// Connection manager
export {
	ConnectionManager,
	ConnectionWrapper,
	createConnectionManager,
	type ConnectionManagerComponents,
	type ConnectionManagerInit,
} from "./connection-manager.ts";
// Main node class and factory
export { createAndStartP2PNode, createP2PNode, P2PNode } from "./node.ts";
// Registrar
export {
	createRegistrar,
	DuplicateProtocolHandlerError,
	Registrar,
	UnhandledProtocolError,
	type RegistrarComponents,
} from "./registrar.ts";
// Transport manager
export {
	createTransportManager,
	TransportManager,
	TransportUnavailableError,
	UnsupportedListenAddressError,
	type TransportManagerComponents,
	type TransportManagerInit,
} from "./transport-manager.ts";

// Types
export type {
	AbortOptions,
	// Configuration types
	AddressConfig,
	AddressManager as AddressManagerInterface,
	ComponentLogger,
	Connection,
	ConnectionDirection,
	ConnectionManager as ConnectionManagerInterface,
	ConnectionStatus,
	// Connection types
	ConnectionTimeline,
	IdentifyResult,
	// Component types
	Logger,
	P2PNodeComponents,
	// Event types
	P2PNodeEvents,
	P2PNodeInit,
	P2PNode as P2PNodeInterface,
	P2PNodeStatus,
	Peer,
	PeerDiscovery,
	PeerDiscoveryEvents,
	// Core types
	PeerId,
	// Peer types
	PeerInfo,
	PeerUpdate,
	Registrar as RegistrarInterface,
	// Stream handler types
	StreamHandler,
	StreamHandlerOptions,
	StreamHandlerRecord,
	Topology,
	// Topology types
	TopologyFilter,
	TransportFactory,
	TransportManagerDialOptions,
	TransportManager as TransportManagerInterface,
} from "./types.ts";

// Utility functions
export {
	DEFAULT_DIAL_TIMEOUT,
	DEFAULT_MAX_CONNECTIONS,
	DEFAULT_MAX_INBOUND_STREAMS,
	DEFAULT_MAX_OUTBOUND_STREAMS,
	peerDiscoverySymbol,
	peerIdEquals,
	peerIdToString,
} from "./types.ts";
