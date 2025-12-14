import { BasicConnection, type BasicConnectionInit } from '../../connection/basic-connection';
import type {
    MessageHandler,
    ProtocolDescriptor,
    ProtocolHandler,
    ProtocolRegistration,
} from './protocol-handler';

export interface RlpxConnectionInit extends BasicConnectionInit {
	// RLPx-specific options can go here
}

/**
 * RlpxConnection - Extends BasicConnection for RLPx protocol
 * No muxing, direct message stream access for RLPx frame handling
 */
export class RlpxConnection extends BasicConnection {
	public direct: boolean = true;

	// Protocol management
	public protocols: Map<string, ProtocolDescriptor> = new Map();
	    public messageRouter: Map<number, ProtocolHandler> = new Map();
	public registrations: Map<string, ProtocolRegistration> = new Map();

	// Base protocol codes
	private readonly BASE_PROTOCOL_LENGTH = 16; // 0x00-0x0F
	
	// Keepalive ping interval (15 seconds as per RLPx spec)
	private readonly PING_INTERVAL = 15000;
	private pingIntervalId?: NodeJS.Timeout;
	private pingTimeoutId?: NodeJS.Timeout;
	private readonly PING_TIMEOUT = 20000; // 20 seconds - if no PONG received, disconnect

	constructor(init: RlpxConnectionInit) {
		super(init);

		// Bind handlers
		this.onIncomingMessage = this.onIncomingMessage.bind(this);

		// Listen for messages on the underlying stream
		this.stream.addEventListener('message', this.onIncomingMessage as EventListener);
		
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
		if (this.status !== 'open') {
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
				this.log('PING timeout - no PONG received, closing connection');
				this.abort(new Error('PING timeout - peer not responding'));
			}, this.PING_TIMEOUT);
		} catch (error: any) {
			this.log('Failed to send PING: %s', error.message);
			// Don't abort on ping send failure - connection might be closing
		}
	}

	/**
	 * Register a protocol handler
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

		this.protocols.set(handler.name, descriptor);

		// Activate the handler with this connection
		if (handler.onActivate) {
			await handler.onActivate(this);
		}

		// Map each code in the range to this handler
		for (let i = 0; i < handler.length; i++) {
			this.messageRouter.set(offset + i, handler);
		}

		this.log(
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
		this.log('registered handler for %s code 0x%s', protocol, code.toString(16));
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
	 * Route incoming message to appropriate protocol handler
	 */
	private async routeMessage(code: number, data: Uint8Array): Promise<void> {
		// Base protocol (0x00-0x0F) - already handled by encrypter/peer
		if (code < this.BASE_PROTOCOL_LENGTH) {
			this.handleBaseProtocol(code, data);
			return;
		}

		// Find protocol handler for this code
		const handler = this.messageRouter.get(code);
		if (handler) {
			// Calculate relative code for the protocol
			const descriptor = this.protocols.get(handler.name)!;
			const relativeCode = code - descriptor.offset;

			this.log(
				'routing code 0x%s to %s (relative: 0x%s)',
				code.toString(16),
				handler.name,
				relativeCode.toString(16),
			);

			await handler.handleMessage(relativeCode, data, this);
		} else {
			this.log.error('no handler for message code 0x%s', code.toString(16));
		}
	}

	/**
	 * Handle base protocol messages (DISCONNECT, PING, PONG)
	 * HELLO is handled by the encrypter
	 */
	private handleBaseProtocol(code: number, data: Uint8Array): void {
		switch (code) {
			case 0x01: // DISCONNECT
				this.log('received DISCONNECT');
				this.abort(new Error('Peer disconnected'));
				break;
			case 0x02: // PING
				this.log('received PING, sending PONG');
				this.sendMessage(0x03, new Uint8Array(0)); // PONG
				break;
			case 0x03: // PONG
				this.log('received PONG');
				// Clear ping timeout - connection is alive
				if (this.pingTimeoutId) {
					clearTimeout(this.pingTimeoutId);
					this.pingTimeoutId = undefined;
				}
				break;
			default:
				this.log('unhandled base protocol code: 0x%s', code.toString(16));
		}
	}

	/**
	 * Handle incoming RLPx messages - now routes to registered handlers
	 */
	private async onIncomingMessage(evt: CustomEvent<any>): Promise<void> {
		const message = evt.detail;
		this.log(
			'received RLPx message, code: 0x%s, size: %d',
			message.code.toString(16),
			message.data?.length || 0,
		);

		await this.routeMessage(message.code, message.data);
	}

	/**
	 * Send a raw RLPx message
	 * Delegates to the underlying maConn (RlpxSocketMultiaddrConnection) which has _sendMessage
	 */
	async sendMessage(code: number, data: Uint8Array): Promise<void> {
		// Access the maConn (RlpxSocketMultiaddrConnection) which has _sendMessage
		const rlpxMaConn = this.maConn as any;
		if (typeof rlpxMaConn._sendMessage === 'function') {
			rlpxMaConn._sendMessage(code, data);
		} else {
			throw new Error('Underlying connection does not support _sendMessage - RLPx handshake may not be complete');
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
		
		this.stream.removeEventListener('message', this.onIncomingMessage as EventListener);

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
		
		this.stream.removeEventListener('message', this.onIncomingMessage as EventListener);

		// Call onClose for all registered protocols
		for (const descriptor of this.protocols.values()) {
			if (descriptor.handler.onClose) {
				descriptor.handler.onClose();
			}
		}

		super.abort(err);
	}
}

export function createRlpxConnection(init: RlpxConnectionInit): RlpxConnection {
	return new RlpxConnection(init);
}
