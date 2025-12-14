import { EventEmitter } from "eventemitter3";
import type { Uint8ArrayList } from "uint8arraylist";
import type { BasicConnection } from "../../../p2p/connection/basic-connection";
import { StreamMessageEvent } from "../../../p2p/stream/types";
import * as RLP from "../../../rlp";
import { concatBytes } from "../../../utils";

/**
 * Adapter to handle RLPx protocol message framing over BasicConnection
 * Handles encoding/decoding protocol messages with code prefix
 */
export class RlpxProtocolAdapter extends EventEmitter {
	private readonly connection: BasicConnection;
	private readonly protocolOffset: number; // Protocol offset for this protocol in capabilities list
	private messageBuffer: Uint8Array = new Uint8Array(0);
	private messageHandler?: (evt: StreamMessageEvent) => void;

	constructor(connection: BasicConnection, protocolOffset: number = 0) {
		super();
		this.connection = connection;
		this.protocolOffset = protocolOffset;
	}

	/**
	 * Send a protocol message with code and RLP-encoded payload
	 * Format: [protocol_code: 1 byte][rlp_payload: variable length]
	 */
	sendMessage(code: number, payload: Uint8Array): void {
		if (this.connection.status !== 'open') {
			throw new Error(`Cannot send message on closed connection`);
		}

		// For RLPx, we use the protocol offset + message code
		// But since we're already bound to a specific protocol, we just use the message code
		// The protocol offset is handled at the RLPx handshake level
		const messageCode = Uint8Array.from([code]);
		// Convert Uint8ArrayList to Uint8Array if needed
		const payloadBytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
		const framedMessage = concatBytes(messageCode, payloadBytes);

		this.connection.underlyingStream.send(framedMessage);
	}

	/**
	 * Send STATUS message (special handling)
	 */
	sendStatus(status: any): void {
		// STATUS is always code 0x00
		const payload = RLP.encode(status);
		this.sendMessage(0x00, payload);
	}

	/**
	 * Start listening for incoming protocol messages
	 */
	startListening(): void {
		if (this.messageHandler) {
			return; // Already listening
		}

		this.messageHandler = (evt: StreamMessageEvent) => {
			this.handleIncomingData(evt.data);
		};

		this.connection.underlyingStream.addEventListener('message', this.messageHandler);
	}

	/**
	 * Stop listening for incoming messages
	 */
	stopListening(): void {
		if (this.messageHandler) {
			this.connection.underlyingStream.removeEventListener('message', this.messageHandler);
			this.messageHandler = undefined;
		}
	}

	/**
	 * Handle incoming stream data, parsing protocol messages
	 * Messages are framed as: [protocol_code: 1 byte][rlp_payload: variable length]
	 * Each RLPx frame from BasicConnection should contain exactly one protocol message
	 */
	private handleIncomingData(data: Uint8Array | Uint8Array[] | Uint8ArrayList): void {
		// Handle Uint8Array, array, or Uint8ArrayList (from stream)
		let dataArray: Uint8Array[];
		if (Array.isArray(data)) {
			dataArray = data;
		} else if (data instanceof Uint8Array) {
			dataArray = [data];
		} else {
			// Uint8ArrayList - convert to array
			dataArray = [];
			for (const chunk of data) {
				dataArray.push(chunk);
			}
		}
		
		let combined = this.messageBuffer;
		for (const chunk of dataArray) {
			combined = concatBytes(combined, chunk);
		}

		// Parse complete messages from buffer
		// Each message is: [1 byte code][RLP payload]
		while (combined.length > 0) {
			if (combined.length < 1) {
				// Need at least 1 byte for protocol code
				break;
			}

			const code = combined[0];
			const payloadData = combined.subarray(1);

			if (payloadData.length === 0) {
				// Empty payload
				this.emit('message', code, new Uint8Array(0));
				this.messageBuffer = new Uint8Array(0);
				break;
			}

			// Use RLP stream decoding to find where the payload ends
			try {
				const decoded = RLP.decode(payloadData, true);
				const payload = decoded.data as Uint8Array;
				const payloadLength = payloadData.length - decoded.remainder.length;

				// Extract the complete payload (code byte + RLP payload)
				const messageLength = 1 + payloadLength; // 1 for code + payload length
				
				if (combined.length >= messageLength) {
					const payload = combined.subarray(1, messageLength);
					this.emit('message', code, payload);
					this.messageBuffer = combined.subarray(messageLength);
					combined = this.messageBuffer;
				} else {
					// Don't have complete message yet
					break;
				}
			} catch (err: any) {
				// If RLP decode fails, it might mean we don't have the complete message yet
				// Store in buffer and wait for more data
				this.connection.log?.(`Incomplete RLP message, buffering: ${err.message}`);
				break;
			}
		}

		this.messageBuffer = combined;
	}

	/**
	 * Get the underlying connection
	 */
	getConnection(): BasicConnection {
		return this.connection;
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.stopListening();
		this.removeAllListeners();
	}
}

