import debug from "debug";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import crypto from "node:crypto";
import type { Socket } from "node:net";
import { genPrivateKey, id2pk, pk2id } from "../../../devp2p";
import type { SecureConnection } from "../../connection/types";
import { MAC } from "../../transport/rlpx/mac";
import {
	sendAuthGetAck,
	sendHelloGetHello,
	waitAuthSendAck,
	waitHelloSendHello,
	type HelloContext,
	type HelloResult,
} from "./handlers";
import type { ConnectionEncrypter } from "./types";
import { setupFrame, type HandlerContext } from "./utils";

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
	public helloResult: HelloResult | null = null;

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

	static createNewSession(privateKey: Uint8Array, options: EcciesEncrypterOptions): EcciesEncrypter {
		return new EcciesEncrypter(privateKey, options);
	}

	async secureInBound(socket: Socket): Promise<SecureConnection> {
		this.socket = socket;
		const { authResult, ackMsg } = await waitAuthSendAck(this.getContext());

		this.initMsg = ackMsg;
		this.remoteInitMsg = authResult.remoteInitMsg;
		this.remotePublicKey = authResult.remotePublicKey;
		this.remoteNonce = authResult.remoteNonce;
		this.remoteEphemeralPublicKey = authResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = authResult.ephemeralSharedSecret;

		// Setup frame encryption BEFORE HELLO exchange
		this.setupFrameEncryption(authResult.remoteInitMsg, true);

		// Validate handshake transition: AUTH/ACK → HELLO
		const { validateHandshakeTransition, logMacState } = await import("./utils/validation");
		if (this.ingressMac && this.egressMac) {
			const validation = validateHandshakeTransition(
				socket,
				this.ingressMac,
				this.egressMac,
				"AUTH/ACK",
				"HELLO",
			);
			if (!validation.valid) {
				log(`❌ Handshake validation failed: ${validation.errors.join("; ")}`);
			}
			logMacState(this.ingressMac, this.egressMac, "inbound:before-HELLO", {
				remotePeer: this.remotePublicKey ? Buffer.from(this.remotePublicKey).toString("hex").slice(0, 16) : "unknown",
			});
		}

		// Now do HELLO exchange (responder waits for peer's HELLO first)
		this.helloResult = await this.helloInbound(
			this.options.id, // clientId
			[{ name: "p2p", version: 5 }], // capabilities
			0, // port (0 for no listening port)
			this.options.id, // id
		);

		return this.createResult();
	}

	async secureOutBound(
		socket: Socket,
		remotePeerId?: Uint8Array,
	): Promise<SecureConnection> {
		this.socket = socket;
		log("🔄 [EcciesEncrypter] Starting outbound ECIES handshake");

		this.remotePublicKey = remotePeerId ? id2pk(remotePeerId) : null;
		const context = this.getContext();

		const { authMsg, ackMsg, ackResult, gotEIP8Ack } =
			await sendAuthGetAck(context);

		this.initMsg = authMsg;
		this.remoteInitMsg = ackMsg;
		this.remoteNonce = ackResult.remoteNonce;
		this.remoteEphemeralPublicKey = ackResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = ackResult.ephemeralSharedSecret;

		// For MAC initialization, use the actual ACK message received (remoteInitMsg)
		// This must match what the responder used for its egressMac initialization
		// Note: remoteInitMsg is the raw ACK packet, which matches what responder sent
		// Setup frame encryption BEFORE HELLO exchange
		this.setupFrameEncryption(this.remoteInitMsg, false);

		// Validate handshake transition: AUTH/ACK → HELLO
		const { validateHandshakeTransition, logMacState } = await import("./utils/validation");
		if (this.ingressMac && this.egressMac) {
			const validation = validateHandshakeTransition(
				socket,
				this.ingressMac,
				this.egressMac,
				"AUTH/ACK",
				"HELLO",
			);
			if (!validation.valid) {
				log(`❌ Handshake validation failed: ${validation.errors.join("; ")}`);
			}
			logMacState(this.ingressMac, this.egressMac, "outbound:before-HELLO", {
				remotePeer: remotePeerId ? Buffer.from(remotePeerId).toString("hex").slice(0, 16) : "unknown",
			});
		}

		// Now do HELLO exchange (initiator sends HELLO first)
		this.helloResult = await this.helloOutbound(
			this.options.id, // clientId
			[{ name: "p2p", version: 5 }], // capabilities
			0, // port (0 for no listening port)
			this.options.id, // id
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
		const remotePeer = this.remotePublicKey ? pk2id(this.remotePublicKey) : null;

		return {
			socket: this.socket,
			remotePeer: remotePeer!,
			privateKey: this.privateKey,
			publicKey: this.publicKey,
			remotePublicKey: this.remotePublicKey,
			nonce: this.nonce,
			ephemeralPrivateKey: this.ephemeralPrivateKey,
			ephemeralPublicKey: this.ephemeralPublicKey,
			requireEip8: this.options.requireEip8,
			remoteInfo: {
				remotePublicKey: this.remotePublicKey,
				remoteNonce: this.remoteNonce,
			},
		};
	}

	private getContext(): HandlerContext {
		return {
			socket: this.socket,
			privateKey: this.privateKey,
			publicKey: this.publicKey,
			remotePublicKey: this.remotePublicKey,
			nonce: this.nonce,
			ephemeralPrivateKey: this.ephemeralPrivateKey,
			ephemeralPublicKey: this.ephemeralPublicKey,
			requireEip8: this.options.requireEip8,
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

	async helloOutbound(
		clientId: Uint8Array,
		capabilities: Array<{ name: string; version: number }>,
		port: number,
		id: Uint8Array,
		timeoutMs = 10000,
	): Promise<HelloResult> {
		if (!this.isHandshakeComplete) {
			throw new Error("ECIES handshake must complete before HELLO exchange");
		}

		const ctx: HelloContext = {
			socket: this.socket,
			ingressAes: this.ingressAes,
			egressAes: this.egressAes,
			ingressMac: this.ingressMac,
			egressMac: this.egressMac,
			clientId,
			capabilities,
			port,
			id,
		};

		return sendHelloGetHello(ctx, timeoutMs);
	}

	async helloInbound(
		clientId: Uint8Array,
		capabilities: Array<{ name: string; version: number }>,
		port: number,
		id: Uint8Array,
		timeoutMs = 10000,
	): Promise<HelloResult> {
		if (!this.isHandshakeComplete) {
			throw new Error("ECIES handshake must complete before HELLO exchange");
		}

		const ctx: HelloContext = {
			socket: this.socket,
			ingressAes: this.ingressAes,
			egressAes: this.egressAes,
			ingressMac: this.ingressMac,
			egressMac: this.egressMac,
			clientId,
			capabilities,
			port,
			id,
		};

		return waitHelloSendHello(ctx, timeoutMs);
	}
}
