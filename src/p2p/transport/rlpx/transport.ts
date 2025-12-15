import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import type { TcpSocketConnectOpts } from "net";
import net from "node:net";
import { EthMessageCode } from "../../../client/net/protocol/eth/definitions";
import {
	type SafePromise,
	type SafeResult,
	safeError,
	safeResult
} from "../../../utils/safe";
import { multiaddrToNetConfig } from "../../../utils/utils";
import type { EcciesEncrypter as EcciesEncrypterType } from "../../connection-encrypters";
import { EcciesEncrypter } from "../../connection-encrypters";
import { Upgrader } from "../../connection/upgrader";
import { toRlpxConnection } from "./rlpx-to-connection";
import { RlpxConnection, createRlpxConnection } from "./RlpxConnection";
import { TransportListener, createListener } from "./transport-listener";
import type { ListenerContext, TransportDialOpts } from "./types";

const log = debug("p2p:transport:rlpx");

export interface TransportInit {
	upgrader: Upgrader;
	privateKey: Uint8Array;
	id: Uint8Array;
	dialOpts?: TransportDialOpts;
}

export class Transport {
	private readonly upgrader: Upgrader;
	private readonly privateKey: Uint8Array;
	private readonly id: Uint8Array;
	private readonly connectionCache: Map<string, RlpxConnection> = new Map();
	private readonly encrypterMap: Map<string, EcciesEncrypterType> = new Map();
	private readonly inFlightDials = new Map<string, SafePromise<RlpxConnection>>();
	private readonly dialOpts: TransportDialOpts;
	private dialQueue: Array<() => void> = [];
	private activeDials = 0;

	constructor(init: TransportInit) {
		this.upgrader = init.upgrader;
		this.privateKey = init.privateKey;
		this.id = init.id;
		this.dialOpts = init.dialOpts ?? { maxActiveDials: 1000 };
	}

	async dial(peerAddr: Multiaddr, remotePeerId?: Uint8Array, timeoutMs = 60_000): SafePromise<RlpxConnection> {
		const peerAddrStr = peerAddr.toString();
		const netOptions = multiaddrToNetConfig(peerAddr) as TcpSocketConnectOpts;

		// Check for existing connection
		const existingConn = this.checkExistingConnection(peerAddr);
		if (existingConn) return existingConn;

		const existingDial = this.inFlightDials.get(peerAddrStr);
		if (existingDial) return existingDial;

		const dialPromise = this.scheduleDial(async (): SafePromise<RlpxConnection> => {
			return new Promise((resolve) => {
				const socket = net.connect(netOptions);

				socket.once("connect", async () => {
					try {
						log(`📡 Connected to ${netOptions.host}:${netOptions.port}, starting handshake...`);

						// Create encrypter for outbound (we know the remote ID)
						const encrypter = new EcciesEncrypter(this.privateKey, {
							requireEip8: true,
							id: this.id,
							remoteId: remotePeerId ?? null,
						});

						// Do ECIES + HELLO handshake directly on raw socket
						const secureResult = await encrypter.secureOutBound(socket, remotePeerId);

						log(`✅ Handshake complete! Remote peer: ${Buffer.from(secureResult.remotePeer!).toString("hex").slice(0, 16)}`);

						// Now wrap in connection abstractions
						const maConn = toRlpxConnection({
							socket,
							remoteAddr: peerAddr,
							direction: "outbound",
							remotePeerId: secureResult.remotePeer,
							encrypter,
						});

						const connId = `${(parseInt(String(Math.random() * 1e9))).toString(36)}${Date.now()}`;
						const rlpxConnection = createRlpxConnection({
							id: connId,
							maConn,
							stream: maConn,
							remotePeer: secureResult.remotePeer!,
							direction: "outbound",
							cryptoProtocol: "eccies",
						});

						// Store encrypter mapped to connection ID for lifetime isolation
						// This ensures each connection has its own encrypter instance with isolated MAC/AES state
						this.encrypterMap.set(connId, encrypter);

						// Cache the connection
						this.connectionCache.set(peerAddrStr, rlpxConnection);
						maConn.socket.on("close", () => {
							this.connectionCache.delete(peerAddrStr);
							this.encrypterMap.delete(connId);
							log(`Cleaned up encrypter for connection ${connId}`);
						});

						resolve(safeResult(rlpxConnection));
					} catch (err: any) {
						log(`❌ Handshake failed: ${err.message}`);
						socket.destroy();
						resolve(safeError(err));
					}
				});

				socket.once("error", (err) => {
					log(`❌ Socket error: ${err.message}`);
					resolve(safeError(err));
				});

				// Timeout handling
				const timeout = setTimeout(() => {
					socket.destroy();
					resolve(safeError(new Error(`Dial timeout after ${timeoutMs}ms`)));
				}, timeoutMs);

				socket.once("connect", () => clearTimeout(timeout));
				socket.once("error", () => clearTimeout(timeout));
			});
		});

		this.inFlightDials.set(peerAddrStr, dialPromise);
		const result = await dialPromise;
		this.inFlightDials.delete(peerAddrStr);

		return result;
	}

	private async scheduleDial(dialCallback: () => SafePromise<RlpxConnection>): SafePromise<RlpxConnection> {
		if (this.activeDials >= this.dialOpts.maxActiveDials) {
			await new Promise<void>((resolve) => this.dialQueue.push(resolve));
		}

		this.activeDials++;
		const result = await dialCallback();

		this.activeDials--;
		const nextDial = this.dialQueue.shift();
		nextDial?.();

		return result;
	}

	private checkExistingConnection(peerAddr: Multiaddr): SafeResult<RlpxConnection> | null {
		const cacheKey = peerAddr.toString();
		const cachedConnection = this.connectionCache.get(cacheKey);

		if (cachedConnection && cachedConnection.messageRouter.has(EthMessageCode.STATUS) && cachedConnection.messageRouter.get(EthMessageCode.STATUS)?.name === "STATUS") {
			return safeResult(cachedConnection);
		}

		// Clean up stale connections
		if (cachedConnection) {
			this.connectionCache.delete(cacheKey);
		}

		return null;
	}

	createListener(context: Omit<ListenerContext, "upgrader">): TransportListener {
		return createListener({
			...context,
			upgrader: this.upgrader,
			privateKey: this.privateKey,
			id: this.id,
		});
	}

	getConnections(): RlpxConnection[] {
		return Array.from(this.connectionCache.values());
	}

	async closeAllConnections(): Promise<void> {
		for (const connection of this.connectionCache.values()) {
			try {
				await connection.close();
			} catch {
				// Ignore errors during close
			}
		}
		this.connectionCache.clear();
		this.encrypterMap.clear();
	}
}

export function createTransport(init: TransportInit): Transport {
	return new Transport(init);
}
