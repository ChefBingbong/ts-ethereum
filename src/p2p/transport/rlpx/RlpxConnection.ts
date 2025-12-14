import debug from 'debug';
import { Connection, ConnectionComponents, ConnectionInit, Registrar } from '../../connection';
import type {
    MessageHandler,
    ProtocolDescriptor,
    ProtocolHandler,
    ProtocolRegistration,
} from './protocol-handler';
import { RlpxProtocolRegistrarAdapter } from './rlpx-protocol-registrar-adapter';

const log = debug('p2p:rlpx:connection');

export interface RlpxConnectionInit extends ConnectionInit {
	// RLPx-specific options can go here
	// Note: stream is required (not omitted) since Connection needs it
}

/**
 * RlpxConnection - Extends Connection for RLPx protocol
 * No muxing, direct message stream access for RLPx frame handling
 * Uses Connection base class but disables muxing/MSS-select
 */
export class RlpxConnection extends Connection {
	public direct: boolean = true;

	// Protocol management
	public protocols: Map<string, ProtocolDescriptor> = new Map();
	public messageRouter: Map<number, ProtocolHandler> = new Map();
	public registrations: Map<string, ProtocolRegistration> = new Map();
	
	// RLPx protocol registrar adapter (bridges Registrar with ProtocolHandler system)
	private readonly rlpxRegistrar: RlpxProtocolRegistrarAdapter;

	// Base protocol codes
	private readonly BASE_PROTOCOL_LENGTH = 16; // 0x00-0x0F
	
	// Keepalive ping interval (15 seconds as per RLPx spec)
	private readonly PING_INTERVAL = 15000;
	private pingIntervalId?: NodeJS.Timeout;
	private pingTimeoutId?: NodeJS.Timeout;
	private readonly PING_TIMEOUT = 20000; // 20 seconds - if no PONG received, disconnect

	constructor(components: ConnectionComponents, init: RlpxConnectionInit) {
		// Call Connection super with components and init, but set muxer to undefined
		// RLPx doesn't use muxing - messages are sent directly via frames
		super(components, {
			...init,
			muxer: undefined, // RLPx doesn't use muxing
		});

		// Create RLPx protocol registrar adapter
		this.rlpxRegistrar = new RlpxProtocolRegistrarAdapter(components.registrar);

		// Bind handlers
		this.onIncomingMessage = this.onIncomingMessage.bind(this);

		// Listen for messages on the underlying stream
		// ((this as any).stream as any).addEventListener('message', this.onIncomingMessage as EventListener);
		
		// Start keepalive ping mechanism
		this.startKeepalive();
	}
	
	/**
	 * Start sending PING messages periodically to keep connection alive
	 */
	private startKeepalive(): void {
		// Send initial PING after a short delay
		setTimeout(() => {
			this.sendPing();
		}, 15000);
		
		// Set up periodic PING interval
		this.pingIntervalId = setInterval(() => {
			this.sendPing();
		}, this.PING_INTERVAL);
	}
	
	/**
	 * Send a PING message (code 0x02)
	 */
	private async sendPing(): Promise<void> {
		if ((this as any).status !== 'open') {
			return;
		}
		
		try {
			// Send PING (code 0x02) with empty data
			await this.sendMessage(0x02, new Uint8Array(0));
			
			// Set timeout - if no PONG received, connection is dead
			if (this.pingTimeoutId) {
				clearTimeout(this.pingTimeoutId);
			}
			this.pingTimeoutId = setTimeout(() => {
				log('PING timeout - no PONG received, closing connection');
				this.abort(new Error('PING timeout - peer not responding'));
			}, this.PING_TIMEOUT);
		} catch (error: any) {
			log('Failed to send PING: %s', error.message);
			// Don't abort on ping send failure - connection might be closing
		}
	}

	/**
	 * Register a protocol handler
	 * Synchronizes registration across three systems:
	 * 1. protocols Map (metadata: offset, length)
	 * 2. messageRouter Map (actual message routing: code -> handler)
	 * 3. rlpxRegistrar adapter (bridges to Registrar for compatibility)
	 * 
	 * @param handler - The protocol handler implementation
	 * @returns The assigned offset for this protocol
	 */
	async registerProtocol(handler: ProtocolHandler): Promise<number> {
		if (this.protocols.has(handler.name)) {
			throw new Error(`Protocol ${handler.name} already registered`);
		}

		// Calculate offset (after base protocol + existing protocols)
		let offset = this.BASE_PROTOCOL_LENGTH;
		for (const descriptor of this.protocols.values()) {
			offset += descriptor.length;
		}

		const descriptor: ProtocolDescriptor = {
			handler,
			offset,
			length: handler.length,
		};

		// 1. Register in protocols Map (metadata)
		this.protocols.set(handler.name, descriptor);

		// 2. Activate the handler with this connection
		if (handler.onActivate) {
			await handler.onActivate(this);
		}

		// 3. Map each code in the range to this handler (message routing)
		for (let i = 0; i < handler.length; i++) {
			this.messageRouter.set(offset + i, handler);
		}

		// 4. Register in rlpxRegistrar adapter (bridges to Registrar)
		this.rlpxRegistrar.registerRlpxProtocol(handler);

		log(
			'📋 [registerProtocol] Registered protocol %s at offset 0x%s (length: %d, version: %d)',
			handler.name,
			offset.toString(16),
			handler.length,
			handler.version,
		);
		log(
			'registered protocol %s at offset 0x%s (length: %d)',
			handler.name,
			offset.toString(16),
			handler.length,
		);

		return offset;
	}

	/**
	 * Register a simple handler function for a specific message code
	 * Useful for quick handler registration without full protocol implementation
	 */
	registerHandler(protocol: string, code: number, handler: MessageHandler): void {
		let registration = this.registrations.get(protocol);
		if (!registration) {
			registration = {
				name: protocol,
				version: 1,
				handlers: new Map(),
			};
			this.registrations.set(protocol, registration);
		}

		registration.handlers.set(code, handler);
		log('registered handler for %s code 0x%s', protocol, code.toString(16));
	}

	/**
	 * Get registered protocols as capabilities for HELLO message
	 */
	getCapabilities(): Array<{ name: string; version: number }> {
		return Array.from(this.protocols.values()).map((desc) => ({
			name: desc.handler.name,
			version: desc.handler.version,
		}));
	}

	/**
	 * Get protocol offset for a given protocol name
	 */
	getProtocolOffset(protocolName: string): number | undefined {
		const descriptor = this.protocols.get(protocolName);
		return descriptor?.offset;
	}

	/**
	 * Get absolute code from protocol name and relative code
	 */
	getAbsoluteCode(protocolName: string, relativeCode: number): number {
		const offset = this.getProtocolOffset(protocolName);
		if (offset === undefined) {
			throw new Error(`Protocol ${protocolName} not registered`);
		}
		return offset + relativeCode;
	}

	/**
	 * Route incoming message to appropriate protocol handler
	 */
	private async routeMessage(code: number, data: Uint8Array): Promise<void> {
		log('📥 [routeMessage] Received message code=0x%s size=%d', code.toString(16), data.length);

		// Base protocol (0x00-0x0F) - already handled by encrypter/peer
		if (code < this.BASE_PROTOCOL_LENGTH) {
			log('📥 [routeMessage] Routing to base protocol handler');
			this.handleBaseProtocol(code, data);
			return;
		}

		// Find protocol handler for this code
		const handler = this.messageRouter.get(code);
		if (handler) {
			// Calculate relative code for the protocol
			const descriptor = this.protocols.get(handler.name)!;
			const relativeCode = code - descriptor.offset;

			log(
				'📥 [routeMessage] Routing code 0x%s to protocol %s (offset=0x%s, relative=0x%s)',
				code.toString(16),
				handler.name,
				descriptor.offset.toString(16),
				relativeCode.toString(16),
			);

			try {
				await handler.handleMessage(relativeCode, data, this);
				log('✅ [routeMessage] Successfully handled message code=0x%s', code.toString(16));
			} catch (error: any) {
				log('❌ [routeMessage] Error handling message code=0x%s: %s', code.toString(16), error.message);
				throw error;
			}
		} else {
			log('⚠️ [routeMessage] No handler found for message code 0x%s', code.toString(16));
			log.error('no handler for message code 0x%s', code.toString(16));
		}
	}

	/**
	 * Handle base protocol messages (DISCONNECT, PING, PONG)
	 * HELLO is handled by the encrypter
	 */
	private handleBaseProtocol(code: number, data: Uint8Array): void {
		log('🔧 [handleBaseProtocol] Handling base protocol code=0x%s', code.toString(16));
		switch (code) {
			case 0x01: // DISCONNECT
				log('🔌 [handleBaseProtocol] Received DISCONNECT');
				log('received DISCONNECT');
				this.abort(new Error('Peer disconnected'));
				break;
			case 0x02: // PING
				log('🏓 [handleBaseProtocol] Received PING, sending PONG');
				log('received PING, sending PONG');
				this.sendMessage(0x03, new Uint8Array(0)); // PONG
				break;
			case 0x03: // PONG
				log('🏓 [handleBaseProtocol] Received PONG');
				log('received PONG');
				// Clear ping timeout - connection is alive
				if (this.pingTimeoutId) {
					clearTimeout(this.pingTimeoutId);
					this.pingTimeoutId = undefined;
				}
				break;
			default:
				log('⚠️ [handleBaseProtocol] Unhandled base protocol code=0x%s', code.toString(16));
				log('unhandled base protocol code: 0x%s', code.toString(16));
		}
	}

	/**
	 * Handle incoming RLPx messages - now routes to registered handlers
	 */
	private async onIncomingMessage(evt: CustomEvent<any>): Promise<void> {
		const message = evt.detail;
		log(
			'📨 [onIncomingMessage] Received RLPx message code=0x%s size=%d',
			message.code.toString(16),
			message.data?.length || 0,
		);

		await this.routeMessage(message.code, message.data);
	}

	/**
	 * Send a raw RLPx message
	 * @param code - Absolute message code (includes protocol offset)
	 * @param data - Message data
	 * @param protocolName - Optional protocol name for logging
	 */
	async sendMessage(code: number, data: Uint8Array, protocolName?: string): Promise<void> {
		log(
			'📤 [sendMessage] Sending message code=0x%s size=%d%s',
			code.toString(16),
			data.length,
			protocolName ? ` protocol=${protocolName}` : '',
		);

		// Access the maConn (RlpxSocketMultiaddrConnection) which has _sendMessage
		const rlpxMaConn = (this as any).maConn as any;
		if (typeof rlpxMaConn._sendMessage === 'function') {
			rlpxMaConn._sendMessage(code, data);
			log('✅ [sendMessage] Message sent successfully code=0x%s', code.toString(16));
		} else {
			const error = new Error('Underlying connection does not support _sendMessage - RLPx handshake may not be complete');
			log('❌ [sendMessage] Failed to send: %s', error.message);
			throw error;
		}
	}

	/**
	 * Override newStream to throw error - RLPx doesn't use streams
	 */
	override async newStream(_protocols: string | string[], _options?: any): Promise<any> {
		throw new Error('RlpxConnection does not support newStream - use sendMessage() for RLPx protocol messages');
	}

	/**
	 * Clean up keepalive timers
	 */
	private stopKeepalive(): void {
		if (this.pingIntervalId) {
			clearInterval(this.pingIntervalId);
			this.pingIntervalId = undefined;
		}
		if (this.pingTimeoutId) {
			clearTimeout(this.pingTimeoutId);
			this.pingTimeoutId = undefined;
		}
	}

	/**
	 * Override close to clean up listeners and call protocol onClose handlers
	 */
	override async close(options: any = {}): Promise<void> {
		// Stop keepalive ping
		this.stopKeepalive();
		
		((this as any).stream as any).removeEventListener('message', this.onIncomingMessage as EventListener);

		// Call onClose for all registered protocols
		for (const descriptor of this.protocols.values()) {
			if (descriptor.handler.onClose) {
				await descriptor.handler.onClose();
			}
		}

		await super.close(options);
	}

	/**
	 * Override abort to clean up listeners and call protocol onClose handlers
	 */
	override abort(err: Error): void {
		// Stop keepalive ping
		this.stopKeepalive();
		
		((this as any).stream as any).removeEventListener('message', this.onIncomingMessage as EventListener);

		// Call onClose for all registered protocols
		for (const descriptor of this.protocols.values()) {
			if (descriptor.handler.onClose) {
				descriptor.handler.onClose();
			}
		}

		super.abort(err);
	}
}

/**
 * Factory function to create RlpxConnection
 * Creates a Registrar and passes it along with init to RlpxConnection constructor
 */
export function createRlpxConnection(
	init: RlpxConnectionInit,
	registrar?: Registrar
): RlpxConnection {
	// Create registrar if not provided
	const rlpxRegistrar = registrar ?? new Registrar({
		peerId: init.remotePeer,
	});

	// Create ConnectionComponents
	const components: ConnectionComponents = {
		registrar: rlpxRegistrar,
	};

	return new RlpxConnection(components, init);
}
