import debug from "debug";
import { getRandomBytesSync } from "ethereum-cryptography/random";
import { secp256k1 } from "ethereum-cryptography/secp256k1";
import crypto from "node:crypto";
import type { Socket } from "node:net";
import { concatBytes } from "../../../utils";
import { genPrivateKey, id2pk } from "../../../utils/utils";
import type { SecureConnection } from "../../connection/types";
import { sendAuthGetAck, waitAuthSendAck } from "./handlers";
import { MAC } from "./mac";
import type { ConnectionEncrypter } from "./types";
import { type HandlerContext, setupFrame } from "./utils";

const log = debug("p2p:encrypter");

export type EcciesEncrypterOptions = {
	requireEip8: boolean;
	id: Uint8Array;
	remoteId: Uint8Array | null;
};

type Decipher = crypto.DecipherGCM;

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
	protected ingressAes: Decipher | null = null;
	protected egressAes: Decipher | null = null;
	protected ingressMac: MAC | null = null;
	protected egressMac: MAC | null = null;
	protected bodySize: number | null = null;
	protected initMsg: Uint8Array | null = null;
	public socket: Socket;
	private _buffer: Uint8Array = new Uint8Array(0);
	public readonly options: EcciesEncrypterOptions;

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
		const ctx = this.createContext();
		const { authResult, ackMsg } = await waitAuthSendAck(ctx);

		this.initMsg = ackMsg;
		this.remoteInitMsg = authResult.remoteInitMsg;
		this.remotePublicKey = authResult.remotePublicKey;
		this.remoteNonce = authResult.remoteNonce;
		this.remoteEphemeralPublicKey = authResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = authResult.ephemeralSharedSecret;

		this.setupFrameEncryption(authResult.remoteInitMsg, true);
		return this.createResult();
	}

	async secureOutBound(
		socket: Socket,
		remotePeerId?: Uint8Array,
	): Promise<SecureConnection> {
		this.remotePublicKey = id2pk(remotePeerId);
		this.socket = socket;
		const ctx = this.createContext();
		const { authMsg, ackMsg, ackResult, gotEIP8Ack } =
			await sendAuthGetAck(ctx);

		this.initMsg = authMsg;
		this.remoteInitMsg = ackMsg;
		this.remoteNonce = ackResult.remoteNonce;
		this.remoteEphemeralPublicKey = ackResult.remoteEphemeralPublicKey;
		this.ephemeralSharedSecret = ackResult.ephemeralSharedSecret;

		const sharedMacData = gotEIP8Ack
			? concatBytes(ackMsg.subarray(0, 2), ackMsg)
			: ackMsg;
		this.setupFrameEncryption(sharedMacData, false);
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
		const remotePeer = this.remotePublicKey
			? this.remotePublicKey.length === 65
				? this.remotePublicKey.slice(1) // Remove 0x04 prefix
				: this.remotePublicKey
			: new Uint8Array(64);

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
}
