import debug from "debug";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import crypto from "node:crypto";
import type { Socket } from "node:net";
import { genPrivateKey, id2pk } from "../../../devp2p";
import { concatBytes } from "../../../utils";
import type { SecureConnection } from "../../connection/types";
import { MAC } from "../../transport/rlpx/mac";
import { sendAuthGetAck, waitAuthSendAck } from "./handlers";
import type { ConnectionEncrypter } from "./types";
import { type HandlerContext, setupFrame } from "./utils";
import { createAckEIP8, createAckOld, parseAckEIP8, parseAckPlain } from "./utils/ack";
import { createAuthEIP8, createAuthNonEIP8, parseAuthEIP8, parseAuthPlain } from "./utils/auth";

const log = debug("p2p:encrypter");

export type EcciesEncrypterOptions = {
	requireEip8: boolean;
	id: Uint8Array;
	remoteId: Uint8Array | null;
};

type Decipher = crypto.DecipherGCM;

export type HandshakeState = "idle" | "auth" | "ack" | "complete";

export class EcciesEncrypter implements ConnectionEncrypter {
	private nonce: Uint8Array;
	public protocol = "eccies";
	private privateKey: Uint8Array;
	private publicKey: Uint8Array;
	private remotePublicKey: Uint8Array | null;
	private remoteNonce: Uint8Array | null = null;
	protected remoteInitMsg: Uint8Array | null = null;
	private ephemeralPrivateKey: Uint8Array;
	private ephemeralPublicKey: Uint8Array;
	private ephemeralSharedSecret: Uint8Array | null = null;
	protected remoteEphemeralPublicKey: Uint8Array | null = null;
	public ingressAes: Decipher | null = null;
	public egressAes: Decipher | null = null;
	public ingressMac: MAC | null = null;
	public egressMac: MAC | null = null;
	protected bodySize: number | null = null;
	protected initMsg: Uint8Array | null = null;
	public socket: Socket;
	private _buffer: Uint8Array = new Uint8Array(0);
	public readonly options: EcciesEncrypterOptions;
	public handshakeState: HandshakeState = "idle";

	constructor(privateKey: Uint8Array, options: EcciesEncrypterOptions) {
		this.privateKey = privateKey;
		this.options = options;
		this.publicKey = id2pk(options.id);
		this.remotePublicKey = options.remoteId ? id2pk(options.remoteId) : null;
		this.nonce = getRandomBytesSync(32);
		this.ephemeralPrivateKey = genPrivateKey();
		this.ephemeralPublicKey = secp256k1.getPublicKey(
			this.ephemeralPrivateKey,
			false,
		);
	}

	async secureInBound(socket: Socket): Promise<SecureConnection> {
		this.socket = socket;
		this.handshakeState = "idle";
		const ctx = this.createContext();
		const { authResult, ackMsg } = await waitAuthSendAck(ctx);

		this.initMsg = ackMsg;
		this.remoteInitMsg = authResult.remoteInitMsg;
		this.remotePublicKey = authResult.remotePublicKey;
		this.remoteNonce = authResult.remoteNonce;
		this.remoteEphemeralPublicKey = authResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = authResult.ephemeralSharedSecret;

		this.setupFrameEncryption(authResult.remoteInitMsg, true);
		this.handshakeState = "complete";
		return this.createResult();
	}

	async secureOutBound(
		socket: Socket,
		remotePeerId?: Uint8Array,
	): Promise<SecureConnection> {
		this.remotePublicKey = id2pk(remotePeerId);
		this.socket = socket;
		this.handshakeState = "idle";
		log("🔄 [EcciesEncrypter] Starting outbound ECIES handshake");
		log(
			"🔄 [EcciesEncrypter] Socket state - destroyed: %s, readable: %s, writable: %s",
			socket.destroyed,
			socket.readable,
			socket.writable,
		);
		log(
			"🔄 [EcciesEncrypter] Remote peer ID: %s",
			Buffer.from(remotePeerId || [])
				.toString("hex")
				.slice(0, 16),
		);

		const ctx = this.createContext();
		log(
			"🔄 [EcciesEncrypter] Created handler context, sending AUTH message...",
		);

		const { authMsg, ackMsg, ackResult, gotEIP8Ack } =
			await sendAuthGetAck(ctx);

		log("✅ [EcciesEncrypter] Sent AUTH, received ACK");

		this.initMsg = authMsg;
		this.remoteInitMsg = ackMsg;
		this.remoteNonce = ackResult.remoteNonce;
		this.remoteEphemeralPublicKey = ackResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = ackResult.ephemeralSharedSecret;

		log("🔄 [EcciesEncrypter] Setting up frame encryption (outbound)...");
		const sharedMacData = gotEIP8Ack
			? concatBytes(ackMsg.subarray(0, 2), ackMsg)
			: ackMsg;
		this.setupFrameEncryption(sharedMacData, false);
		this.handshakeState = "complete";
		log(
			"✅ [EcciesEncrypter] Frame encryption setup complete (outbound), handshake complete: %s",
			this.isHandshakeComplete,
		);

		return this.createResult();
	}

	private setupFrameEncryption(
		remoteData: Uint8Array,
		incoming: boolean,
	): void {
		if (!this.remoteNonce || !this.ephemeralSharedSecret || !this.initMsg) {
			throw new Error("Cannot setup frame: missing required data");
		}
		const result = setupFrame(
			remoteData,
			this.nonce,
			this.remoteNonce,
			this.initMsg,
			this.ephemeralSharedSecret,
			incoming,
		);
		if (!result) throw new Error("Failed to setup frame encryption");
		this.ingressAes = result.ingressAes as Decipher;
		this.egressAes = result.egressAes as Decipher;
		this.ingressMac = result.ingressMac;
		this.egressMac = result.egressMac;
	}

	private createResult(): SecureConnection {
		// Convert remotePublicKey to peer ID (64 bytes without 0x04 prefix)
		const remotePeer = this.remotePublicKey;

		return {
			socket: this.socket,
			remotePeer: remotePeer,
		};
	}

	private createContext(): HandlerContext {
		return {
			socket: this.socket,
			privateKey: this.privateKey,
			publicKey: this.publicKey,
			remotePublicKey: this.remotePublicKey,
			nonce: this.nonce,
			ephemeralPrivateKey: this.ephemeralPrivateKey,
			ephemeralPublicKey: this.ephemeralPublicKey,
			requireEip8: this.options.requireEip8,
			handshakeState: {
				current: this.handshakeState,
				setState: (state: HandshakeState) => {
					this.handshakeState = state;
					log(`🔄 [EcciesEncrypter] Handshake state: ${state}`);
				},
			},
		};
	}
	get isHandshakeComplete(): boolean {
		return this.ingressAes !== null && this.egressAes !== null;
	}

	get remoteNodeId(): Uint8Array | null {
		return this.remotePublicKey;
	}

	get buffer(): Uint8Array {
		return this._buffer;
	}

	set buffer(value: Uint8Array) {
		this._buffer = value;
	}

	// Methods called directly from RLPx connection (matching ethereumjs pattern)
	public createAndSendAuth(): Uint8Array | undefined {
		if (!this.remotePublicKey) {
			throw new Error("Cannot create AUTH: remote public key not set");
		}

		let authMsg: Uint8Array | undefined;
		if (this.options.requireEip8) {
			authMsg = createAuthEIP8(
				this.remotePublicKey,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.publicKey,
			);
		} else {
			authMsg = createAuthNonEIP8(
				this.remotePublicKey,
				this.privateKey,
				this.nonce,
				this.ephemeralPrivateKey,
				this.ephemeralPublicKey,
				this.publicKey,
			);
		}

		if (!authMsg) {
			return undefined;
		}

		this.initMsg = authMsg;
		return authMsg;
	}

	public parseAuthPlain(data: Uint8Array): void {
		const authResult = parseAuthPlain(
			data,
			this.privateKey,
			this.ephemeralPrivateKey,
			false,
			null,
		);
		if (!authResult) {
			throw new Error("Failed to parse AUTH");
		}
		this.remoteInitMsg = authResult.remoteInitMsg;
		this.remotePublicKey = authResult.remotePublicKey;
		this.remoteNonce = authResult.remoteNonce;
		this.remoteEphemeralPublicKey = authResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = authResult.ephemeralSharedSecret;
	}

	public parseAuthEIP8(data: Uint8Array): void {
		const authResult = parseAuthEIP8(
			data,
			this.privateKey,
			this.ephemeralPrivateKey,
			true,
		);
		if (!authResult) {
			throw new Error("Failed to parse AUTH (EIP8)");
		}
		this.remoteInitMsg = authResult.remoteInitMsg;
		this.remotePublicKey = authResult.remotePublicKey;
		this.remoteNonce = authResult.remoteNonce;
		this.remoteEphemeralPublicKey = authResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = authResult.ephemeralSharedSecret;
	}

	public parseAckPlain(data: Uint8Array): void {
		const ackResult = parseAckPlain(
			data,
			this.privateKey,
			this.ephemeralPrivateKey,
			false,
			null,
		);
		this.remoteNonce = ackResult.remoteNonce;
		this.remoteEphemeralPublicKey = ackResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = ackResult.ephemeralSharedSecret;
		this.remoteInitMsg = data;
	}

	public parseAckEIP8(data: Uint8Array): void {
		const ackResult = parseAckEIP8(
			data,
			this.privateKey,
			this.ephemeralPrivateKey,
			true,
		);
		this.remoteNonce = ackResult.remoteNonce;
		this.remoteEphemeralPublicKey = ackResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = ackResult.ephemeralSharedSecret;
		this.remoteInitMsg = data;
	}

	public createAndSendAck(): void {
		if (!this.remotePublicKey || !this.remoteInitMsg) {
			throw new Error("Cannot create ACK: missing AUTH data");
		}

		// Determine if we should use EIP8 (check if AUTH was EIP8)
		const useEIP8 = this.options.requireEip8;
		let ackMsg: Uint8Array | undefined;
		
		if (useEIP8) {
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
			throw new Error("Failed to create ACK");
		}

		this.initMsg = ackMsg;
		
		// Setup frames (like ethereumjs does in createAckEIP8/createAckOld)
		this.setupFrameEncryption(this.remoteInitMsg, true);
		
		// Send ACK
		this.socket.write(ackMsg);
		this.handshakeState = "complete";
	}

	public setupFrameEncryptionAfterAck(): void {
		if (!this.remoteNonce || !this.ephemeralSharedSecret || !this.initMsg || !this.remoteInitMsg) {
			throw new Error("Cannot setup frame: missing required data");
		}

		// For outbound, use the ACK message as remoteData
		const sharedMacData = this.options.requireEip8
			? concatBytes(this.remoteInitMsg.subarray(0, 2), this.remoteInitMsg)
			: this.remoteInitMsg;
		
		this.setupFrameEncryption(sharedMacData, false);
		this.handshakeState = "complete";
	}
}
