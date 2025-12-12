import debug from "debug";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { hexToBytes } from "ethereum-cryptography/utils";
import crypto from "node:crypto";
import type { Socket } from "node:net";
import type { EncrypterResult } from "../../connection/types";
import { genPrivateKey, id2pk, MAC, zfill } from "../../devp2p";
import * as RLP from "../../rlp";
import { bytesToInt, concatBytes, intToBytes } from "../../utils";
import type { ConnectionEncrypter } from "../eccies/types";
import {
	createAckEIP8,
	createAckOld,
	parseAckEIP8,
	parseAckPlain,
	type AckResult,
} from "./ack";
import {
	createAuthEIP8,
	createAuthNonEIP8,
	parseAuthEIP8,
	parseAuthPlain,
	type AuthResult,
} from "./auth";
import { setupFrame } from "./crypto";

const log = debug("p2p:encrypter");

type EcciesEncrypterOptions = {
	requireEip8: boolean;
	id: Uint8Array;
	remoteId: Uint8Array | null;
};

type Decipher = crypto.DecipherGCM;

export class EcciesEncrypter implements ConnectionEncrypter {
	public protocol = "eccies";
	private publicKey: Uint8Array;
	private remotePublicKey: Uint8Array | null;

	private nonce: Uint8Array;
	private remoteNonce: Uint8Array | null = null;
	private ephemeralPrivateKey: Uint8Array;
	private ephemeralPublicKey: Uint8Array;
	private nextPacketSize = 307;
	private socketData = new Uint8Array();
	public socket: Socket;
	private _state: "Auth" | "Ack" | "Header" | "Body" = "Auth";

	// Frame encryption state
	protected _ingressAes: Decipher | null = null;
	protected _egressAes: Decipher | null = null;
	protected _ingressMac: MAC | null = null;
	protected _egressMac: MAC | null = null;
	protected _remoteEphemeralPublicKey: Uint8Array | null = null;
	protected _ephemeralSharedSecret: Uint8Array | null = null;
	protected _bodySize: number | null = null;

	// Init messages for frame setup
	protected _initMsg: Uint8Array | null = null;
	protected _remoteInitMsg: Uint8Array | null = null;

	// ECIES state variables
	private _gotEIP8Auth = false;
	private _gotEIP8Ack = false;
	private _closed = false;
	private DEBUG = true;
	private _logger = log;

	constructor(
		private privateKey: Uint8Array,
		public readonly options: EcciesEncrypterOptions,
	) {
		this.privateKey = privateKey;
		this.publicKey = id2pk(options.id);
		this.remotePublicKey = options.remoteId ? id2pk(options.remoteId) : null;

		this.nonce = getRandomBytesSync(32);
		this.ephemeralPrivateKey = genPrivateKey();
		this.ephemeralPublicKey = secp256k1.getPublicKey(
			this.ephemeralPrivateKey,
			false,
		);
	}

	setRemote(peerId: Uint8Array) {
		this.remotePublicKey = id2pk(peerId);
	}

	async encryptInOutBound(
		socket: Socket,
		isInitiator: boolean,
	): Promise<EncrypterResult> {
		this.socket = socket;

		return new Promise<EncrypterResult>((resolve, reject) => {
			const onData = (data: Uint8Array) => this.onEcciesMessage(data);
			
			const cleanup = () => {
				socket.off("data", onData);
				socket.off("error", onError);
			};

			const onError = (e: Error) => {
				cleanup();
				socket.destroy();
				reject(e);
			};

			const onHandshakeComplete = () => {
				cleanup();
				resolve({
					socket: this.socket as unknown as import("tls").TLSSocket,
					remoteInfo: { remotePublicKey: this.remotePublicKey },
				});
			};

			// Set up handlers
			this.handshakeCompleteCallback = onHandshakeComplete;
			socket.on("data", onData);
			socket.once("error", onError);

			if (isInitiator) {
				// Outbound connection - send auth first
				// this._state = "Ack"; // We'll be waiting for ack after sending auth
				this.sendAuth();
			} else {
				// Inbound connection - wait for auth
				// this._state = "Auth";
			}
		});
	}

	private handshakeCompleteCallback?: () => void;

	private sendAuth() {
		if (this._closed) return;

		if (this.options.requireEip8) {
			const authEIP8 = createAuthEIP8(
				this.remotePublicKey,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.publicKey,
			);
			if (!authEIP8) {
				this.DEBUG && this._logger("Failed to create auth EIP8");
				return;
			}
			this._initMsg = authEIP8;
			this.socket.write(authEIP8);
		} else {
			const authNonEIP8 = createAuthNonEIP8(
				this.remotePublicKey!,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.ephemeralPublicKey,
				this.publicKey,
			);
			if (!authNonEIP8) {
				this.DEBUG && this._logger("Failed to create auth non-EIP8");
				return;
			}
			this._initMsg = authNonEIP8;
			this.socket.write(authNonEIP8);
		}

		this.nextPacketSize = 210; // Initial expected ack size (non-EIP8)
	}

	private onEcciesMessage(data: Uint8Array) {
		if (this._closed) return;

		this.socketData = concatBytes(this.socketData, data);
		
		try {
			while (this.socketData.length >= this.nextPacketSize) {
				switch (this._state) {
					case "Auth":
						this.handleAuth();
						break;
					case "Ack":
						this.handleAck();
						break;
					case "Header":
						// Handshake complete
						if (this.handshakeCompleteCallback) {
							this.handshakeCompleteCallback();
						}
						return;
				}
			}
		} catch (err) {
			this.DEBUG && this._logger(`ECIES error: ${err}`);
			this.socket.destroy();
		}
	}

	private handleAuth() {
		const bytesCount = this.nextPacketSize;
		const parseData = this.socketData.subarray(0, bytesCount);

		if (!this._gotEIP8Auth) {
			// Check if it's non-EIP8 (starts with 0x04)
			if (parseData.subarray(0, 1) === hexToBytes("0x04")) {
				const result = parseAuthPlain(
					parseData,
					this.privateKey,
					this.ephemeralPrivateKey,
					this._gotEIP8Auth,
				);
				if (result) {
					this.applyAuthResult(result);
				}
			} else {
				// EIP8 format - read size from first 2 bytes
				this._gotEIP8Auth = true;
				this.nextPacketSize = bytesToInt(this.socketData.subarray(0, 2)) + 2;
				return; // Wait for full packet
			}
		} else {
			parseAuthEIP8(
				parseData,
				this.privateKey,
				this.ephemeralPrivateKey,
				this._gotEIP8Auth,
			);
		
		}

		// Consume the data
		
		// Send ack and transition to Header state
		this._state = "Header";
		this.nextPacketSize = 32;
		process.nextTick(() => this.sendAck());
		this.socketData = this.socketData.subarray(bytesCount);

	}

	private applyAuthResult(result: AuthResult) {
		this._remoteInitMsg = result.remoteInitMsg;
		this.remoteNonce = result.remoteNonce;
		this.remotePublicKey = result.remotePublicKey;
		this._ephemeralSharedSecret = result.ephemeralSharedSecret;
		this._remoteEphemeralPublicKey = result.remoteEphemeralPublicKey;
	}

	private sendAck() {
		if (this._closed) return;
		if (!this.remotePublicKey) {
			this.DEBUG && this._logger("Cannot send ack: remotePublicKey is null");
			return;
		}

		let ackMsg: Uint8Array | undefined;

		if (this._gotEIP8Auth) {
			ackMsg = createAckEIP8(
				this.ephemeralPublicKey,
				this.remotePublicKey,
				this.nonce,
			);
		} else {
			ackMsg = createAckOld(
				this.ephemeralPublicKey,
				this.remotePublicKey,
				this.nonce,
			);
		}

		if (!ackMsg) {
			this.DEBUG && this._logger("Failed to create ack message");
			return;
		}

		this._initMsg = ackMsg;
		this.socket.write(ackMsg);

		// Setup frame after sending ack (we're the responder)
		if (this._remoteInitMsg && this._ephemeralSharedSecret && this.remoteNonce) {
			this._setupFrame(this._remoteInitMsg, true);
		}
	}

	private handleAck() {
		const bytesCount = this.nextPacketSize;
		const parseData = this.socketData.subarray(0, bytesCount);

		let result: AckResult | null = null;

		if (!this._gotEIP8Ack) {
			// Check if it's non-EIP8 (starts with 0x04)
			if (parseData[0] === 0x04) {
				result = parseAckPlain(
					parseData,
					this.privateKey,
					this.ephemeralPrivateKey,
					this._gotEIP8Ack,
				);
			} else {
				// EIP8 format - read size from first 2 bytes
				this._gotEIP8Ack = true;
				this.nextPacketSize = bytesToInt(this.socketData.subarray(0, 2)) + 2;
				return; // Wait for full packet
			}
		} else {
			result = parseAckEIP8(
				parseData,
				this.privateKey,
				this.ephemeralPrivateKey,
				this._gotEIP8Ack,
			);
		}

		if (result) {
			this.applyAckResult(result, parseData);
		}

		// Consume the data
		this.socketData = this.socketData.subarray(bytesCount);

		// Transition to Header state (handshake complete)
		this._state = "Header";
		this.nextPacketSize = 32;
	}

	private applyAckResult(result: AckResult, ackData: Uint8Array) {
		this._remoteEphemeralPublicKey = result.remoteEphemeralPublicKey;
		this.remoteNonce = result.remoteNonce;
		this._ephemeralSharedSecret = result.ephemeralSharedSecret;

		// Setup frame after receiving ack (we're the initiator)
		const sharedMacData = this._gotEIP8Ack
			? ackData.subarray(0, 2)
			: Uint8Array.from([]);
		this._setupFrame(concatBytes(sharedMacData, ackData), false);
	}

	protected _setupFrame(remoteData: Uint8Array, incoming: boolean): void {
		if (!this.remoteNonce || !this._ephemeralSharedSecret || !this._initMsg) {
			this.DEBUG && this._logger("Cannot setup frame: missing required data");
			return;
		}

		const result = setupFrame(
			remoteData,
			this.nonce,
			this.remoteNonce,
			this._initMsg,
			this._ephemeralSharedSecret,
			incoming,
		);

		if (result) {
			this._ingressAes = result.ingressAes as Decipher;
			this._egressAes = result.egressAes as Decipher;
			this._ingressMac = result.ingressMac;
			this._egressMac = result.egressMac;
		}
	}

	// ============ Frame encryption methods ============

	createHeader(size: number): Uint8Array | undefined {
		const bufSize = zfill(intToBytes(size), 3);
		const headerData = RLP.encode([0, 0]); // [capability-id, context-id]
		const headerConcat = concatBytes(bufSize, headerData);
		let header: Uint8Array = new Uint8Array(zfill(headerConcat, 16, false));
		
		if (!this._egressAes) return;
		header = Uint8Array.from(this._egressAes.update(header));

		if (!this._egressMac) return;
		this._egressMac.updateHeader(header);
		const tag = Uint8Array.from(this._egressMac.digest());

		return concatBytes(header, tag);
	}

	parseHeader(data: Uint8Array): number | undefined {
		let header = data.subarray(0, 16);
		const mac = data.subarray(16, 32);

		if (!this._ingressMac) return;
		this._ingressMac.updateHeader(header);
		const _mac = Uint8Array.from(this._ingressMac.digest());
		
		if (!this.compareMac(_mac, mac)) {
			throw new Error("Invalid MAC in header");
		}

		if (!this._ingressAes) return;
		header = Uint8Array.from(this._ingressAes.update(header));
		this._bodySize = bytesToInt(header.subarray(0, 3));
		return this._bodySize;
	}

	createBody(data: Uint8Array): Uint8Array | undefined {
		const paddedData = zfill(data, Math.ceil(data.length / 16) * 16, false) as Uint8Array;
		if (!this._egressAes) return;
		const encryptedData = Uint8Array.from(this._egressAes.update(paddedData));

		if (!this._egressMac) return;
		this._egressMac.updateBody(encryptedData);
		const tag = Uint8Array.from(this._egressMac.digest());
		return concatBytes(encryptedData, tag);
	}

	parseBody(data: Uint8Array): Uint8Array | undefined {
		if (this._bodySize === null) throw new Error("Need to parse header first");

		const body = data.subarray(0, -16);
		const mac = data.subarray(-16);

		if (!this._ingressMac) return;
		this._ingressMac.updateBody(body);
		const _mac = Uint8Array.from(this._ingressMac.digest());
		
		if (!this.compareMac(_mac, mac)) {
			throw new Error("Invalid MAC in body");
		}

		const size = this._bodySize;
		this._bodySize = null;

		if (!this._ingressAes) return;
		return Uint8Array.from(this._ingressAes.update(body)).subarray(0, size);
	}

	private compareMac(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	// ============ High-level send/receive methods ============

	sendMessage(code: number, data: Uint8Array): void {
		const payload = RLP.encode([code, data]);
		const header = this.createHeader(payload.length);
		const body = this.createBody(payload);
		
		if (header && body) {
			this.socket.write(concatBytes(header, body));
		}
	}

	// Interface implementations
	async encryptInBound(socket: Socket): Promise<EncrypterResult> {
		return await this.encryptInOutBound(socket, true);
	}

	async encryptOutBound(socket: Socket, remotePeerId?: Uint8Array): Promise<EncrypterResult> {
		if (remotePeerId) {
			this.setRemote(remotePeerId);
		}
		return await this.encryptInOutBound(socket, false);
	}
}
