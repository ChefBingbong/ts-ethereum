/**
 * Bridge to create devp2p ETH protocol instances from BasicConnection
 * This is a temporary solution until we fully migrate away from devp2p
 * 
 * TODO: This needs proper implementation. For now, it returns null and we fall back to legacy devp2p RLPx
 */

import type { BasicConnection } from "../../../p2p/connection/basic-connection";
import type { AbstractProtocol } from "../protocol/abstract-protocol";
import type { Common } from "../../../common";

type Devp2pETH = any; // Temporary type stub

/**
 * Create devp2p ETH protocol instance from BasicConnection
 * This is the main bridge function used by Peer.bindProtocols()
 * 
 * TODO: Implement proper bridge to extract/create devp2p ETH from BasicConnection
 * For now, this returns null and we fall back to legacy devp2p RLPx
 */
export async function createEthProtocolFromBasicConnection(
	basicConn: BasicConnection,
	peerId: string,
	protocolTemplate: AbstractProtocol<any>,
	capabilities: any[],
	common: Common,
): Promise<Devp2pETH | null> {
	// TODO: Implement proper bridge
	// For now, return null to indicate we need to use legacy devp2p RLPx
	// The actual implementation would:
	// 1. Extract socket from BasicConnection
	// 2. Create devp2p RLPx peer from socket
	// 3. Extract ETH protocol from peer
	// OR
	// 1. Refactor EthProtocol.setupTransport() to work with BasicConnection directly
	// 2. Handle RLPx message framing in EthProtocol itself
	return null;
}

