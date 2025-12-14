import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import type { TcpSocketConnectOpts } from "net";
import net from "node:net";
import { bytesToHex } from "../../../utils";
import {
    type SafeError,
    type SafePromise,
    type SafeResult,
    safeError,
    safeResult,
} from "../../../utils/safe";
import { multiaddrToNetConfig } from "../../../utils/utils";
import { BasicConnection } from "../../connection/basic-connection";
import { Connection } from "../../connection/connection";
import { Upgrader } from "../../connection/upgrader";
import { toMultiaddrConnection } from "./multiaddr-connection";
import { TransportListener, createListener } from "./transport-listener";
import type { ListenerContext, TransportDialOpts } from "./types";

const log = debug("p2p:transport");

export interface TransportInit {
	upgrader: Upgrader;
	dialOpts?: TransportDialOpts;
}

export class Transport {
	private readonly upgrader: Upgrader;
	private readonly connectionCache: Map<string, BasicConnection | Connection> = new Map();
	private readonly inFlightDials = new Map<string, SafePromise<BasicConnection | Connection>>();
	private readonly dialOpts: TransportDialOpts;
	private dialQueue: Array<() => void> = [];
	private activeDials = 0;

	constructor(init: TransportInit) {
		this.upgrader = init.upgrader;
		this.dialOpts = init.dialOpts ?? { maxActiveDials: 10 };
	}

	async dialBasic(peerAddr: Multiaddr, remotePeerId?: Uint8Array, timeoutMs = 60_000): SafePromise<BasicConnection> {
		const peerAddrStr = peerAddr.toString();
		const netOptions = multiaddrToNetConfig(peerAddr) as TcpSocketConnectOpts;

		// Check for existing connection
		const existingConn = this.checkExistingConnection(peerAddr);
		if (existingConn) return existingConn;

		const existingDial = this.inFlightDials.get(peerAddrStr);
		if (existingDial) return existingDial;
		
		const dialPromise = this.scheduleDial(async (): SafePromise<BasicConnection | Connection> => {
			const sock = net.createConnection(netOptions);

			sock.on("error", (err) => {
				log(`dial socket error to ${peerAddrStr}: ${err.message}`);
				try {
					sock.destroy();
				} catch {}
			});

			return await new Promise<SafeError<Error> | SafeResult<BasicConnection>>((resolve) => {
				const cleanup = () => {
					clearTimeout(timer);
					sock.off("connect", onConnect);
					sock.off("error", onError);
				};

				const onError = (err: Error) => {
					cleanup();
					try {
						sock.destroy();
					} catch {}
					resolve(safeError(err));
				};

				const onConnect = async () => {
					cleanup();
					const result = await this.onConnect(sock, peerAddr, remotePeerId);
					resolve(result);
				};

				const onTimeout = () => {
					const err = new Error(`connection timeout after ${timeoutMs}ms`);
					cleanup();
					try {
						sock.destroy();
					} catch {}
					resolve(safeError(err));
				};

				sock.once("connect", onConnect);
				sock.once("error", onError);
				const timer = setTimeout(onTimeout, timeoutMs);
			});
		});

		this.inFlightDials.set(peerAddrStr, dialPromise);
		const result = await dialPromise;
		this.inFlightDials.delete(peerAddrStr);

		return result;
	}

	async dialFull(peerAddr: Multiaddr, remotePeerId?: Uint8Array, timeoutMs = 60_000): SafePromise<Connection> {
		const [basicError, basicConn] = await this.dialBasic(peerAddr, remotePeerId, timeoutMs);

		if (basicError) return safeError(basicError);
		
		if (basicConn instanceof Connection) {
			return safeResult(basicConn);
		}

		log(`🔄 Upgrading BasicConnection to full Connection with muxing...`);
		try {
			const fullConn = await basicConn.upgrade(
				this.upgrader.getComponents(),
				this.upgrader.getStreamMuxerFactory()
			);
			log(`✅ Connection upgraded to full: ${fullConn.id}`);

			this.connectionCache.set(peerAddr.toString(), fullConn);
			return safeResult(fullConn);
		} catch (upgradeErr: any) {
			log(`⚠️ Upgrade failed: ${upgradeErr.message}`);
			return safeError(upgradeErr);
		}
	}

	async dial(peerAddr: Multiaddr, remotePeerId?: Uint8Array, timeoutMs = 60_000): SafePromise<Connection> {
		return this.dialFull(peerAddr, remotePeerId, timeoutMs);
	}

	private async scheduleDial(dialCallback: () => SafePromise<BasicConnection | Connection>): SafePromise<BasicConnection | Connection> {
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

	/**
	 * Handle socket connection - always creates BasicConnection (no branching)
	 */
	private async onConnect(socket: net.Socket, peerAddr: Multiaddr, remotePeerId?: Uint8Array): Promise<SafeError<Error> | SafeResult<BasicConnection>> {
		try {
			log(`📡 TCP connected to ${peerAddr.toString()}, creating BasicConnection...`);

			// Create multiaddr connection from raw socket
			const maConn = toMultiaddrConnection({
				socket,
				remoteAddr: peerAddr,
				direction: 'outbound',
				remotePeerId: remotePeerId
			});

			log(`🔐 Starting encryption (basic) for ${peerAddr.toString()}...`);

			// Always create BasicConnection first (encryption only, no muxing)
			const basicConn = await this.upgrader.upgradeOutboundBasic(maConn);

			log(`✅ BasicConnection created: ${basicConn.id}, remote peer: ${bytesToHex(basicConn.remotePeer).slice(0, 18)}...`);

			const cacheKey = peerAddr.toString();
			
			// Cache the BasicConnection
			this.connectionCache.set(cacheKey, basicConn);

			// Remove from cache when closed
			basicConn.addEventListener('close', () => {
				this.connectionCache.delete(cacheKey);
				log(`Connection ${basicConn.id} removed from cache`);
			});

			return safeResult(basicConn);
		} catch (err: any) {
			log(`❌ BasicConnection creation failed for ${peerAddr.toString()}: ${err.message}`);
			return safeError(err);
		}
	}

	private checkExistingConnection(peerAddr: Multiaddr): SafeResult<BasicConnection | Connection> | null {
		const cacheKey = peerAddr.toString();
		const cachedConnection = this.connectionCache.get(cacheKey);

		if (cachedConnection && cachedConnection.status === 'open') {
			return safeResult(cachedConnection);
		}

		// Clean up stale connections
		if (cachedConnection) {
			this.connectionCache.delete(cacheKey);
		}

		return null;
	}

	createListener(context: Omit<ListenerContext, 'upgrader'>): TransportListener {
		return createListener({ 
			...context, 
			upgrader: this.upgrader 
		});
	}

	getConnections(): (BasicConnection | Connection)[] {
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
	}
}

export function createTransport(init: TransportInit): Transport {
	return new Transport(init);
}
