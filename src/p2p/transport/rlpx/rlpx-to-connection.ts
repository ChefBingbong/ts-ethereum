import type { Multiaddr } from "@multiformats/multiaddr";
import type { Socket } from "net";
import type crypto from "node:crypto";
import { pEvent, TimeoutError } from "p-event";
import type { Uint8ArrayList } from "uint8arraylist";
import { bytesToInt, concatBytes } from "../../../utils";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import type { EcciesEncrypter } from "../../connection-encrypters/eccies/eccies-encrypter";
import {
  createBody,
  parseBody,
} from "../../connection-encrypters/eccies/utils/body";
import {
  createHeader,
  HEADER_SIZE,
  parseHeader,
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

    if (this.remotePeerId !== null) {
			// Outbound: we send AUTH, wait for ACK
			// Send AUTH immediately for outbound connections
				this._sendAuth();
		} 
	}

	_sendAuth() {
		if (!this.encrypter) {
			throw new Error("Encrypter not set");
		}
		const authMsg = this.encrypter.createAndSendAuth();
		if (!authMsg) {
			throw new Error("Failed to create AUTH");
		}
		this.socket.write(authMsg);
		this._state = "Ack";
		this._nextPacketSize = 210; // ACK message size (non-EIP8)
	}

	_onSocketData(data: Uint8Array) {
		if (this.status !== "open") {
			this.log("Connection not open, ignoring socket data");
			return;
		}

		this._socketData = concatBytes(this._socketData, data);
		try {
			while (this._socketData.length >= this._nextPacketSize) {
				switch (this._state) {
					case "Auth":
						this._handleAuth();
						break;
					case "Ack":
						this._handleAck();
						break;
					case "Header":
						this._handleHeader();
						break;
					case "Body":
						this._handleBody();
						break;
				}
			}
		} catch (err: any) {
			this.log("Error processing socket data: %s", err.message);
			this.abort(err);
		}
	}

	_handleAuth() {
		const bytesCount = this._nextPacketSize;
		const parseData = this._socketData.subarray(0, bytesCount);

		if (!this.encrypter) {
			throw new Error("Encrypter not set");
		}

		// Check if EIP8 AUTH
		if (!this._gotEIP8Auth) {
			if (parseData.subarray(0, 1)[0] === 0x04) {
				// Non-EIP8 AUTH
				this.encrypter.parseAuthPlain(parseData);
			} else {
				// EIP8 AUTH - need to read size first
				this._gotEIP8Auth = true;
				this._nextPacketSize = bytesToInt(parseData.subarray(0, 2)) + 2;
				return;
			}
		} else {
			// EIP8 AUTH
			this.encrypter.parseAuthEIP8(parseData);
		}

		// After parsing AUTH, send ACK and setup frames
		this.encrypter.createAndSendAck();
		
		// Transition to Header state for RLPx frames
		this._state = "Header";
		this._nextPacketSize = HEADER_SIZE;
		this._socketData = this._socketData.subarray(bytesCount);
	}

	_handleAck() {
		const bytesCount = this._nextPacketSize;
		const parseData = this._socketData.subarray(0, bytesCount);

		if (!this.encrypter) {
			throw new Error("Encrypter not set");
		}

		// Check if EIP8 ACK
		if (!this._gotEIP8Ack) {
			if (parseData.subarray(0, 1)[0] === 0x04) {
				// Non-EIP8 ACK
				this.encrypter.parseAckPlain(parseData);
			} else {
				// EIP8 ACK - need to read size first
				this._gotEIP8Ack = true;
				this._nextPacketSize = bytesToInt(parseData.subarray(0, 2)) + 2;
				return;
			}
		} else {
			// EIP8 ACK
			this.encrypter.parseAckEIP8(parseData);
		}

		// After parsing ACK, setup frames
		this.encrypter.setupFrameEncryptionAfterAck();

		// Transition to Header state for RLPx frames
		this._state = "Header";
		this._nextPacketSize = HEADER_SIZE;
		this._socketData = this._socketData.subarray(bytesCount);
	}

	_handleHeader() {
		const bytesCount = this._nextPacketSize;
		const parseData = this._socketData.subarray(0, bytesCount);

		if (!this.encrypter) {
			throw new Error("Encrypter not set - cannot parse RLPx header");
		}

		const ingressAes = (this.encrypter as any).ingressAes;
		const ingressMac = (this.encrypter as any).ingressMac;

		if (!ingressAes || !ingressMac) {
			throw new Error("ECIES handshake not complete - AES/MAC not available");
		}

		const result = parseHeader(parseData, ingressAes, ingressMac);
		if (!result || result.bodySize === undefined) {
			this.log("Invalid header size!");
			return;
		}

		this._bodySize = result.bodySize;
		this._state = "Body";
		this._nextPacketSize = result.paddedBodySize + 16; // body + MAC
		this._socketData = this._socketData.subarray(bytesCount);
	}

	_handleBody() {
		const bytesCount = this._nextPacketSize;
		const parseData = this._socketData.subarray(0, bytesCount);

		if (!this.encrypter) {
			throw new Error("Encrypter not set - cannot parse RLPx body");
		}

		const ingressAes = (this.encrypter as any).ingressAes;
		const ingressMac = (this.encrypter as any).ingressMac;

		if (!ingressAes || !ingressMac || this._bodySize === null) {
			throw new Error("ECIES handshake not complete - AES/MAC not available");
		}

		const result = parseBody(parseData, this._bodySize, ingressAes, ingressMac);
		if (!result) {
			this.log("Empty body!");
			return;
		}

		// Reset state for next message
		this._state = "Header";
		this._nextPacketSize = HEADER_SIZE;
		this._bodySize = null;
		this._socketData = this._socketData.subarray(bytesCount);

		// Push the payload data to the read buffer
		this.push(result.bodyPayload);
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
}

export const toRlpxConnection = (
	init: RlpxConnectionOptions,
): RlpxSocketMultiaddrConnection => {
	return new RlpxSocketMultiaddrConnection(init);
};
