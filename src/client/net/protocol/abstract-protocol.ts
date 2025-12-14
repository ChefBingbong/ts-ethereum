import { EventEmitter } from "eventemitter3";
import type { Config } from "../../config.ts";
import { EthMessageCode, MessageDefinition, ProtocolSpec } from "./eth/definitions.ts";

export interface ProtocolOptions {
	config: Config;
	timeout?: number;
}

export interface ProtocolEvents {
	message: [code: number, payload: any];
	status: [status: any];
}

export abstract class AbstractProtocol<TProtocolOptions extends ProtocolOptions> extends EventEmitter<ProtocolEvents> {
	public config: Config;
        public timeout: number;
        public opened: boolean;
	public _peer: any; // Peer instance (e.g., Devp2pRLPxPeer or our Peer class) - made public for access
	protected _service: any; // Service instance (e.g., FullEthereumService)

	constructor(public readonly spec: ProtocolSpec<TProtocolOptions>) {
		super();
		this.config = spec.options.config;
		this.timeout = spec.options.timeout ?? 8000;
		this._peer = null;
		this._service = null;
	}

	abstract open(): Promise<boolean | void>;
    
	abstract handshake(sender: any): Promise<any>;

	abstract send(code: number, payload: any, sender?: any): void | Promise<any>;

	abstract handle(code: number, data: Uint8Array, context?: any): void;

	abstract setupTransport(transportContext: any): void;

	get name() {
		return this.spec.name;
	}

    get versions() {
		return this.spec.versions;
	}

	get messages() {
		return Object.values(this.spec.messages);
	}

	encodeStatus<TArgs, TResponse>(args: TArgs): TResponse {
		const status = this.spec.messages[EthMessageCode.STATUS];
		return status.encode(args);
	}

	decodeStatus<TArgs, TResponse>(args: TArgs): TResponse {
		const status = this.spec.messages[EthMessageCode.STATUS];
		return status.decode(args);
	}

	encode<TArgs extends any[], TResponse>(message: MessageDefinition, args: TArgs): TResponse {
		return message.encode(...args);
	}

	decode<TArgs extends any[], TResponse>(message: MessageDefinition, args: TArgs): TResponse {
		return message.decode(...args);
	}
}
