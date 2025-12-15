import type { Multiaddr } from "@multiformats/multiaddr";
import type { Socket } from "net";
import type crypto from "node:crypto";
import { pEvent, TimeoutError } from "p-event";
import type { Uint8ArrayList } from "uint8arraylist";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import type { EcciesEncrypter } from "../../connection-encrypters/eccies/eccies-encrypter";
import {
	createBody
} from "../../connection-encrypters/eccies/utils/body";
import {
	sendFrameMessage
} from "../../connection-encrypters/eccies/utils/frame";
import {
	createHeader
} from "../../connection-encrypters/eccies/utils/header";
import { AbstractMultiaddrConnection } from "../../connection/abstract-multiaddr-connection";
import { AbortOptions } from "../../connection/types";
import { MessageStreamDirection, SendResult } from "../../stream/types";

type Decipher = crypto.DecipherGCM;

export interface RlpxConnectionOptions {
	socket: Socket;
	remoteAddr: Multiaddr;
	direction: MessageStreamDirection;
	inactivityTimeout?: number;
	localAddr?: Multiaddr;
	remotePeerId?: Uint8Array;
	encrypter?: EcciesEncrypter;
}

class RlpxSocketMultiaddrConnection extends AbstractMultiaddrConnection {
	public socket: Socket;
	public remotePeerId?: Uint8Array;
	private encrypter?: EcciesEncrypter;
	private _socketData: Uint8Array = new Uint8Array(0);
	private _state: "Auth" | "Ack" | "Header" | "Body" = "Auth";
	private _nextPacketSize: number = 307; // AUTH message size (non-EIP8)
	private _bodySize: number | null = null;
	private _gotEIP8Auth: boolean = false;
	private _gotEIP8Ack: boolean = false;
	private _direction: MessageStreamDirection;

	constructor(init: RlpxConnectionOptions) {
		let remoteAddr = init.remoteAddr;

		if (init.localAddr != null) {
			remoteAddr = init.localAddr;
		} else if (remoteAddr == null) {
			if (init.socket.remoteAddress == null || init.socket.remotePort == null) {
				throw new Error("Could not determine remote address or port");
			}

			remoteAddr = ipPortToMultiaddr(
				init.socket.remoteAddress,
				init.socket.remotePort,
			);
		}

		super({
			...init,
			remoteAddr,
			logNamespace: `p2p:rlpx:${remoteAddr.toString()}`,
		});

		this.socket = init.socket;
		this.remotePeerId = init.remotePeerId;
		this.encrypter = init.encrypter;
		this._direction = init.direction;

		// Set initial state based on direction


		this.socket.on('data', this._onSocketData.bind(this))
		// this.socket.on('error', (err: Error) => this.events.emit('error', err))
		// this.socket.once('close', this._onSocketClose.bind(this))
    this._nextPacketSize = 307; // AUTH message size (non-EIP8)

		this.socket.on("error", (err) => {
			this.log("rlpx error %s %s", remoteAddr.toString(), err.message);
			this.abort(err);
		});

		this.socket.setTimeout(init.inactivityTimeout ?? 2 * 60 * 1_000);

		this.socket.once("timeout", () => {
			this.log("rlpx timeout %s", remoteAddr.toString());
			this.abort(new TimeoutError());
		});

		this.socket.once("end", () => {
			this.log("rlpx end %s", remoteAddr.toString());
			this.onTransportClosed();
		});

		this.socket.once("close", (hadError: boolean) => {
			this.log("rlpx close %s", remoteAddr.toString());

			if (hadError) {
				this.abort(new Error("RLPx transmission error"));
				return;
			}

			this.onTransportClosed();
		});

		this.socket.on("drain", () => {
			this.log("rlpx drain");
			this.safeDispatchEvent("drain");
		});

    // if (this.remotePeerId !== null) {
	// 		// Outbound: we send AUTH, wait for ACK
	// 		// Send AUTH immediately for outbound connections
	// 			this._sendAuth();
	// 	} 
	}

	_onSocketData(data: Uint8Array) {
		if (this.status !== "open") {
			this.log("Connection not open, ignoring socket data");
			return;
		}

		// this._socketData = concatBytes(this._socketData, data);
		// try {
		// 	while (this._socketData.length >= this._nextPacketSize) {
		// 		switch (this._state) {
		// 			case "Auth":
		// 				this._handleAuth();
		// 				break;
		// 			case "Ack":
		// 				this._handleAck();
		// 				break;
		// 			case "Header":
		// 				this._handleHeader();
		// 				break;
		// 			case "Body":
		// 				this._handleBody();
		// 				break;
		// 		}
		// 	}
		// } catch (err: any) {
		// 	this.log("Error processing socket data: %s", err.message);
		// 	this.abort(err);
		// }
	}

	sendData(data: Uint8ArrayList): SendResult {
		if (!this.encrypter) {
			throw new Error("Encrypter not set - cannot send RLPx frame");
		}

		const egressAes = (this.encrypter as any).egressAes;
		const egressMac = (this.encrypter as any).egressMac;

		if (!egressAes || !egressMac) {
			throw new Error("ECIES handshake not complete - AES/MAC not available");
		}

		let sentBytes = 0;
		let canSendMore = true;

		for (const buf of data) {
			// Create RLPx header
			const header = createHeader(buf.byteLength, egressAes, egressMac);
			if (!this.socket.destroyed) {
				const headerWritten = this.socket.write(header);
				if (!headerWritten) {
					canSendMore = false;
					break;
				}
			}

			// Create RLPx body
			const body = createBody(buf, egressAes, egressMac);
			if (!this.socket.destroyed) {
				const bodyWritten = this.socket.write(body);
				if (!bodyWritten) {
					canSendMore = false;
					break;
				}
				sentBytes += buf.byteLength;
			} else {
				canSendMore = false;
				break;
			}
		}

		return {
			sentBytes,
			canSendMore,
		};
	}

	async sendClose(options?: AbortOptions): Promise<void> {
		if (this.socket.destroyed) {
			return;
		}

		this.socket.destroySoon();

		await pEvent(this.socket, "close", options);
	}

	sendReset(): void {
		this.socket.resetAndDestroy();
	}

	sendPause(): void {
		this.socket.pause();
	}

	sendResume(): void {
		this.socket.resume();
	}

	/**
	 * Send an RLPx protocol message with code and data
	 * This is used by RlpxConnection.sendMessage()
	 */
	_sendMessage(code: number, data: Uint8Array): void {
		if (!this.encrypter) {
			throw new Error("Encrypter not set - cannot send RLPx frame");
		}

		const egressAes = (this.encrypter as any).egressAes;
		const egressMac = (this.encrypter as any).egressMac;

		if (!egressAes || !egressMac) {
			throw new Error("ECIES handshake not complete - AES/MAC not available");
		}

		if (this.socket.destroyed) {
			throw new Error("Socket is destroyed");
		}

		// Use sendFrameMessage to create and send the RLPx frame
		sendFrameMessage(this.socket, egressAes, egressMac, code, data);
	}
}

export const toRlpxConnection = (
	init: RlpxConnectionOptions,
): RlpxSocketMultiaddrConnection => {
	return new RlpxSocketMultiaddrConnection(init);
};
