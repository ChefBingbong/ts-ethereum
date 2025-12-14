import type { Socket } from "node:net";
import type { RlpxConnection } from "../../RlpxConnection";

export enum MessageType {
	HANDSHAKE = "handshake",
	REQUEST = "request",
	RESPONSE = "response",
	ANNOUNCEMENT = "announcement",
}

export interface HandlerContext {
	connection: RlpxConnection;
	socket?: Socket;
	timeout?: number;
}

export abstract class BaseEthHandler {
	abstract readonly messageType: MessageType;
	abstract readonly code: number;
	abstract readonly name: string;

	protected timeout: number = 8000;

	// Send method - implemented by subclasses
	abstract send(payload: any, ctx: HandlerContext): Promise<void>;

	// Handle method - implemented by subclasses
	abstract handle(data: Uint8Array, ctx: HandlerContext): Promise<any>;
}

