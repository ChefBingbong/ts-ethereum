import type { EthProtocol, Sender } from "../protocol.ts";

export abstract class Handler {
	constructor(protected protocol: EthProtocol) {}

	// For REQUEST messages
	async initiator?(payload: any, sender: Sender, timeoutMs?: number): Promise<any>;
	async responder?(payload: any, context?: any): Promise<void>;
	
	// For ANNOUNCEMENT messages
	send?(payload: any, sender: Sender): void;
	handle?(payload: any, context?: any): void;
	
	// For HANDSHAKE messages
	async handshakeInitiator?(payload: any, sender: Sender, timeoutMs?: number): Promise<any>;
	async handshakeResponder?(payload: any, context?: any): Promise<void>;
}

