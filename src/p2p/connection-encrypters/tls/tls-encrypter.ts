import { createHash } from "crypto";
import debug from "debug";
import type { Socket } from "node:net";
import {
	TLSSocket,
	type TLSSocketOptions,
	connect as tlsConnect,
} from "node:tls";
import { pk2id } from "../../../kademlia";
import type { SecureConnection } from "../../connection/types";
import { ConnectionEncrypter } from "../eccies/types";
import { generateBoundCertificate, verifyPeerCertificate } from "./cert";

const log = debug("p2p:encrypter:tls");

export interface TLSEncrypterInit {
	privateKey: Uint8Array;
}

export class TLSEncrypter implements ConnectionEncrypter {
	public readonly protocol = "tls";
	private readonly privateKey: Uint8Array;
	private trustedCache: Map<string, any> = new Map();

	constructor(init: TLSEncrypterInit) {
		this.privateKey = init.privateKey;
	}

	private fingerprint(raw: Buffer): string {
		return createHash("sha256").update(raw).digest("hex");
	}

	async secureInBound(socket: Socket): Promise<SecureConnection> {
		try {
			const creds = await generateBoundCertificate(this.privateKey);
			const tlsSocket = await this.upgradeToTlsSocket(socket, creds, true);
			return await this.onTlsConnected(tlsSocket);
		} catch (error: any) {
			log("TLS inbound handshake failed: %s", error.message);
			throw error;
		}
	}

	async secureOutBound(socket: Socket, peerId?: Uint8Array): Promise<SecureConnection> {
		try {
			const creds = await generateBoundCertificate(this.privateKey);
			const tlsSocket = await this.upgradeToTlsSocket(socket, creds, false);
			return await this.onTlsConnected(tlsSocket);
		} catch (error: any) {
			log("TLS outbound handshake failed: %s", error.message);
			throw error;
		}
	}

	private async onTlsConnected(tlsSocket: TLSSocket): Promise<SecureConnection> {
		return new Promise((resolve, reject) => {
			const onError = (e: Error) => {
				tlsSocket.destroy();
				cleanup();
				reject(e);
			};

			const onReady = async () => {
				try {
					const peer = tlsSocket.getPeerCertificate(true);
					const fp = this.fingerprint(peer.raw);

					let remotePeer: Uint8Array;

					if (this.trustedCache.has(fp)) {
						const remoteInfo = this.trustedCache.get(fp);
						remotePeer = pk2id(remoteInfo.nodePubCompressed);
					} else {
						const remoteInfo = await verifyPeerCertificate(peer.raw);
						this.trustedCache.set(fp, remoteInfo);
						remotePeer = pk2id(remoteInfo.nodePubCompressed);
					}

					cleanup();
					resolve({
						socket: tlsSocket as unknown as Socket,
						remotePeer
					});
				} catch (err: any) {
					cleanup();
					reject(err);
				}
			};

			const cleanup = () => {
				tlsSocket.off("secureConnect", onReady);
				tlsSocket.off("error", onError);
			};

			tlsSocket.once("secureConnect", onReady);
			tlsSocket.once("error", onError);
		});
	}

	private async upgradeToTlsSocket(
		raw: Socket,
		creds: { certPEM: string; keyPEM: string },
		isServer: boolean,
	): Promise<TLSSocket> {
		const baseOpts: TLSSocketOptions = {
			cert: creds.certPEM,
			key: creds.keyPEM,
			minVersion: "TLSv1.3",
			maxVersion: "TLSv1.3",
			rejectUnauthorized: false,
		};

		if (isServer) {
			return new TLSSocket(raw, {
				...baseOpts,
				isServer: true,
				requestCert: true,
			});
		}
		return tlsConnect({ ...baseOpts, socket: raw });
	}
}

export function createTLSEncrypter(init: TLSEncrypterInit): TLSEncrypter {
	return new TLSEncrypter(init);
}
