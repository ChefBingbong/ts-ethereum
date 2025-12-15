import type { RlpxConnection } from './RlpxConnection';

export interface ProtocolHandler {
	name: string;
	version: number;
	length: number; // Number of message codes this protocol uses

	// Called when protocol is activated after HELLO
	onActivate?(connection: RlpxConnection): void | Promise<void>;

	// Handle incoming messages for this protocol
	handleMessage(
		code: number,
		data: Uint8Array,
		connection: RlpxConnection,
	): void | Promise<void>;

	// Called when connection closes
	onClose?(): void | Promise<void>;
}

export interface ProtocolDescriptor {
	handler: ProtocolHandler;
	offset: number; // Starting message code offset
	length: number; // Number of codes reserved
}

export interface MessageHandler {
	(data: Uint8Array, connection: RlpxConnection): void | Promise<void>;
}

export interface ProtocolRegistration {
	name: string;
	version: number;
	handlers: Map<number, MessageHandler>; // code -> handler function
}

