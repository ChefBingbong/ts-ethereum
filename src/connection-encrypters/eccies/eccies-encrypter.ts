import debug from "debug";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import { hexToBytes } from "ethereum-cryptography/utils";
import type { Socket } from "node:net";
import type { EncrypterResult } from "../../connection/types";
import { genPrivateKey, id2pk } from "../../devp2p";
import { bytesToInt, concatBytes } from "../../utils";
import type { ConnectionEncrypter } from "../eccies/types";
import {
	createAckEIP8,
	createAckOld,
	parseAckEIP8,
	parseAckPlain,
} from "./ack";
import {
	createAuthEIP8,
	createAuthNonEIP8,
	parseAuthEIP8,
	parseAuthPlain,
} from "./auth";

const log = debug("p2p:encrypter");

type EcciesEncrypterOptions = {
	requireEip8: boolean;
	id: Uint8Array;
	remoteId: Uint8Array | null;
};
export class EcciesEncrypter implements ConnectionEncrypter {
	public protocol = "eccies";
	private publicKey: Uint8Array;
	private remotePublicKey: Uint8Array | null;

	private nonce: Uint8Array;
	private ephemeralPrivateKey: Uint8Array;
	private ephemeralPublicKey: Uint8Array;
	private nextPacketSize = 307;
	private socketData = new Uint8Array();
	public socket: Socket;
	private _state: "Auth" | "Ack" | "Header" | "Body" = "Auth";

	// ECIES state variables
	private _gotEIP8Auth = false;
	private _gotEIP8Ack = false;
	private _remoteInitMsg: Uint8Array | null = null;
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
		isServer: boolean,
	): Promise<EncrypterResult> {
		this.socket = socket;

		console.log(this.remotePublicKey, isServer, ")");
		return new Promise<EncrypterResult>((resolve, reject) => {
			const cleanup = () => {
				socket.off("data", this.onEcciesMessage.bind(this));
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
			socket.on("data", this.onEcciesMessage.bind(this));
			socket.on("connect", this.onEcciesMessage.bind(this));

			socket.once("error", onError);

			if (isServer) {
				// Outbound connection - send auth
				this.sendAuth();
			}
			// For inbound connections, we wait for auth message
		});
	}

	private handshakeCompleteCallback?: () => void;

	private sendAuth() {
		if (this._closed) return;

		console.log(this.options);
		if (this.options.requireEip8) {
			const authEIP8 = createAuthEIP8(
				this.remotePublicKey,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.publicKey,
			);
			if (!authEIP8) return;
			this.socket.write(authEIP8);
		} else {
			const authNonEIP8 = createAuthNonEIP8(
				this.options.id!,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.ephemeralPublicKey,
				this.publicKey,
			);
			if (!authNonEIP8) return;
			this.socket.write(authNonEIP8);
		}

		this._state = "Ack";
		this.nextPacketSize = 210;
	}

	private onEcciesMessage(data: Uint8Array) {
		console.log("onEcciesMessage", this.socketData.length, this.nextPacketSize);

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
		} catch (_err) {
			this.socket.destroy();
			if (this.handshakeCompleteCallback) {
				// This will trigger the reject in the promise
			}
		}
	}

	private handleAuth() {
		const bytesCount = this.nextPacketSize;
		const parseData = this.socketData.subarray(0, bytesCount);

		if (!this._gotEIP8Auth) {
			if (
				parseData.subarray(0, 1).toString() === hexToBytes("0x04").toString()
			) {
				// Initialize _remoteInitMsg with the raw data
				this._remoteInitMsg = parseData;
				parseAuthPlain(
					parseData,
					this._remoteInitMsg,
					this.privateKey,
					this.ephemeralPrivateKey,
					this._gotEIP8Auth,
				);
			} else {
				this._gotEIP8Auth = true;
				this.nextPacketSize = bytesToInt(this.socketData.subarray(0, 2)) + 2;
				return;
			}
		} else {
			this._remoteInitMsg = parseData;
			parseAuthEIP8(
				parseData,
				this._remoteInitMsg,
				this.privateKey,
				this.ephemeralPrivateKey,
				this._gotEIP8Auth,
			);
		}

		this._state = "Header";
		this.nextPacketSize = 32;
		process.nextTick(() => this.sendAck());
		this.socketData = this.socketData.subarray(bytesCount);
	}

	private sendAck() {
		if (this._closed) return;

		if (this._gotEIP8Auth) {
			const ackEIP8 = createAckEIP8(
				this.ephemeralPublicKey,
				this._remoteInitMsg!,
				this.nonce,
			);
			if (!ackEIP8) return;
			this.socket.write(ackEIP8);
		} else {
			const ackOld = createAckOld(
				this.ephemeralPublicKey,
				this._remoteInitMsg!,
				this.nonce,
			);
			if (!ackOld) return;
			this.socket.write(ackOld);
		}
		this._state = "Header";
		this.nextPacketSize = 32;
	}

	private handleAck() {
		const bytesCount = this.nextPacketSize;
		const parseData = this.socketData.subarray(0, bytesCount);

		if (!this._gotEIP8Ack) {
			if (
				parseData.subarray(0, 1).toString() === hexToBytes("0x04").toString()
			) {
				parseAckPlain(
					parseData,
					this.privateKey,
					this.ephemeralPrivateKey,
					this._gotEIP8Ack,
				);
				this.DEBUG &&
					this._logger(
						`Received ack (old format) from ${this.socket.remoteAddress}:${this.socket.remotePort}`,
					);
			} else {
				this._gotEIP8Ack = true;
				this.nextPacketSize = bytesToInt(this.socketData.subarray(0, 2)) + 2;
				return;
			}
		} else {
			parseAckEIP8(
				parseData,
				this.privateKey,
				this._gotEIP8Ack,
				this.ephemeralPrivateKey,
			);
		}

		this._state = "Header";
		this.nextPacketSize = 32;
		this.socketData = this.socketData.subarray(bytesCount);
	}

	// Interface implementations
	async encryptInBound(socket: Socket): Promise<EncrypterResult> {
		return await this.encryptInOutBound(socket, true);
	}

	async encryptOutBound(socket: Socket): Promise<EncrypterResult> {
		return await this.encryptInOutBound(socket, false);
	}
}
