import debug from 'debug';
import type { MessageHandler, ProtocolHandler } from './protocol-handler';
import type { RlpxConnection } from './RlpxConnection';

const log = debug('p2p:rlpx:protocol:base');

/**
 * Base class for protocol handlers with message code mapping
 */
export abstract class BaseProtocolHandler implements ProtocolHandler {
	public readonly name: string;
	public readonly version: number;
	public readonly length: number;

	protected handlers: Map<number, MessageHandler> = new Map();
	protected connection?: RlpxConnection;

	constructor(name: string, version: number, length: number = 16) {
		this.name = name;
		this.version = version;
		this.length = length;
	}

	/**
	 * Register a handler for a specific message code
	 */
	protected on(code: number, handler: MessageHandler): void {
		this.handlers.set(code, handler);
	}

	/**
	 * Called when protocol is activated
	 */
	async onActivate(connection: RlpxConnection): Promise<void> {
		this.connection = connection;
	}

	/**
	 * Route message to registered handler
	 */
	async handleMessage(
		code: number,
		data: Uint8Array,
		connection: RlpxConnection,
	): Promise<void> {
		log('🔄 [handleMessage] Protocol=%s code=0x%s size=%d', this.name, code.toString(16), data.length);
		const handler = this.handlers.get(code);
		if (handler) {
			log('✅ [handleMessage] Found handler for code=0x%s', code.toString(16));
			try {
				await handler(data, connection);
				log('✅ [handleMessage] Handler executed successfully code=0x%s', code.toString(16));
			} catch (error: any) {
				log('❌ [handleMessage] Handler error code=0x%s: %s', code.toString(16), error.message);
				throw error;
			}
		} else {
			log('⚠️ [handleMessage] No handler for code=0x%s', code.toString(16));
			console.warn(
				`[${this.name}] No handler for code 0x${code.toString(16)}`,
			);
		}
	}

	/**
	 * Send a message for this protocol
	 * @param code - Relative code (will be converted to absolute by adding protocol offset)
	 * @param data - Message data
	 */
	protected async send(code: number, data: Uint8Array): Promise<void> {
		if (!this.connection) {
			throw new Error('Protocol not activated');
		}

		// Get absolute code by adding protocol offset
		const absoluteCode = this.connection.getAbsoluteCode(this.name, code);
		log('📤 [send] Protocol=%s relative=0x%s absolute=0x%s size=%d', 
			this.name, code.toString(16), absoluteCode.toString(16), data.length);

		await this.connection.sendMessage(absoluteCode, data, this.name);
	}

	async onClose(): Promise<void> {
		this.connection = undefined;
	}
}

