import debug from 'debug';
import type { Registrar } from '../../connection/registrar';
import type { ProtocolHandler } from './protocol-handler';

const log = debug('p2p:rlpx:registrar-adapter');

/**
 * Adapter that bridges Registrar (for MSS-select/stream protocols) 
 * with RLPx ProtocolHandler system (for frame-based protocols)
 * 
 * This allows RLPx protocols to be tracked in the Registrar for compatibility,
 * while actual message routing happens via the messageRouter in RlpxConnection.
 */
export class RlpxProtocolRegistrarAdapter {
	private readonly registrar: Registrar;
	private readonly protocolHandlers: Map<string, ProtocolHandler> = new Map();

	constructor(registrar: Registrar) {
		this.registrar = registrar;
	}

	/**
	 * Register an RLPx protocol handler
	 * This registers the protocol name in the Registrar for compatibility,
	 * but actual routing is handled by RlpxConnection.messageRouter
	 */
	registerRlpxProtocol(handler: ProtocolHandler): void {
		const protocolName = handler.name;
		
		if (this.protocolHandlers.has(protocolName)) {
			log('⚠️ [registerRlpxProtocol] Protocol %s already registered', protocolName);
			return;
		}

		// Store the handler
		this.protocolHandlers.set(protocolName, handler);

		// Register in Registrar with a no-op stream handler
		// RLPx doesn't use streams, but we register for compatibility
		// The actual message handling happens via messageRouter
		try {
			this.registrar.handle(
				protocolName,
				async (_stream: any) => {
					// No-op: RLPx protocols don't use streams
					// Messages are routed via RlpxConnection.messageRouter instead
					log('⚠️ [Registrar handler] RLPx protocol %s received stream (should use sendMessage instead)', protocolName);
				},
				{
					maxInboundStreams: 0, // RLPx doesn't use streams
					maxOutboundStreams: 0,
					force: false,
				}
			);
			log('✅ [registerRlpxProtocol] Registered protocol %s in Registrar', protocolName);
		} catch (error: any) {
			// If already registered, that's okay - just log
			if (error.message.includes('already registered')) {
				log('ℹ️ [registerRlpxProtocol] Protocol %s already in Registrar', protocolName);
			} else {
				log('❌ [registerRlpxProtocol] Failed to register %s: %s', protocolName, error.message);
				throw error;
			}
		}
	}

	/**
	 * Get list of registered RLPx protocol names
	 */
	getProtocols(): string[] {
		return Array.from(this.protocolHandlers.keys());
	}

	/**
	 * Check if a protocol is registered
	 */
	hasProtocol(name: string): boolean {
		return this.protocolHandlers.has(name);
	}

	/**
	 * Get the ProtocolHandler for a protocol name
	 */
	getProtocolHandler(name: string): ProtocolHandler | undefined {
		return this.protocolHandlers.get(name);
	}

	/**
	 * Unregister a protocol
	 */
	unregisterProtocol(name: string): void {
		this.protocolHandlers.delete(name);
		try {
			this.registrar.unhandle(name);
			log('✅ [unregisterProtocol] Unregistered protocol %s', name);
		} catch (error: any) {
			log('⚠️ [unregisterProtocol] Failed to unregister %s from Registrar: %s', name, error.message);
		}
	}
}

