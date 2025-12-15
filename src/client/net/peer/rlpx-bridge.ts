/**
 * Bridge to create devp2p ETH protocol instances from Connection
 * This is a temporary solution until we fully migrate away from devp2p
 * 
 * TODO: This needs proper implementation. For now, it returns null and we fall back to legacy devp2p RLPx
 */

import { Common } from "../../../chain-config";
import type { Connection } from "../../../p2p/connection/connection";
import type { AbstractProtocol } from "../protocol/abstract-protocol";

type Devp2pETH = any; // Temporary type stub

/**
 * Create devp2p ETH protocol instance from Connection
 * This is the main bridge function used by Peer.bindProtocols()
 * 
 * TODO: Implement proper bridge to extract/create devp2p ETH from Connection
 * For now, this returns null and we fall back to legacy devp2p RLPx
 */
export async function createEthProtocolFromConnection(
	basicConn: Connection,
	peerId: string,
	protocolTemplate: AbstractProtocol<any>,
	capabilities: any[],
	common: Common,
): Promise<Devp2pETH | null> {
	// TODO: Implement proper bridge
	// For now, return null to indicate we need to use legacy devp2p RLPx
	// The actual implementation would:
	// 1. Extract socket from Connection
	// 2. Create devp2p RLPx peer from socket
	// 3. Extract ETH protocol from peer
	// OR
	// 1. Refactor EthProtocol.setupTransport() to work with Connection directly
	// 2. Handle RLPx message framing in EthProtocol itself
	return null;
}

