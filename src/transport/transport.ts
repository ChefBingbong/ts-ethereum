import type { Multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import type { TcpSocketConnectOpts } from "net";
import net from "node:net";
import { ConnectionEncrypter } from "../connection-encrypters/eccies/types";
import { MuxedConnection } from "../connection/connection";
import { pk2id } from "../kademlia";
import {
	type SafeError,
	type SafePromise,
	type SafeResult,
	safeError,
	safeResult,
	safeSyncTry,
} from "../utils/safe";
import { multiaddrToNetConfig } from "../utils/utils";
import { TransportListener } from "./transport-listener";
import type { CreateTransportOptions, TransportDialOpts } from "./types";

const log = debug("p2p:transport");

export class Transport {
	private encrypter: ConnectionEncrypter;
	private connectionCache: Map<string, MuxedConnection> = new Map();
	private inFlightDials = new Map<string, SafePromise<MuxedConnection>>();

	private dialOpts: TransportDialOpts;
	private dialQueue: Array<() => void> = [];
	private activeDials = 0;

	constructor(dialOpts: TransportDialOpts, encrypter: ConnectionEncrypter) {
		this.encrypter = encrypter;
		this.dialOpts = dialOpts;
	}

	async dial(peerAddr: Multiaddr, remotePeerId?: Uint8Array, timeoutMs = 60_000) {
		const peerAddrStr = peerAddr.toString();
		const netOptions = multiaddrToNetConfig(peerAddr) as TcpSocketConnectOpts;

		const existingConn = this.checkAndReturnExistingConnection(peerAddr);
		if (existingConn) return existingConn;

		const dialPromise = this.scheduleDial(async () => {
			const sock = net.createConnection(netOptions);

			sock.on("error", (err) => {
				log(`dial socket error to ${peerAddr.toString()}: ${err.message}`);
				try {
					sock.destroy();
				} catch {}
			});

			return await new Promise<SafeResult<MuxedConnection> | SafeError<Error>>(
				(resolve) => {
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
						const [error, res] = await this.onConnect(sock, peerAddr, remotePeerId);
						cleanup();
						if (error) onError(error);
						resolve(safeResult(res));
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
				},
			);
		});

		this.inFlightDials.set(peerAddrStr, dialPromise);
		const [error, dialResult] = await dialPromise;
		this.inFlightDials.delete(peerAddrStr);

		if (error) return safeError(error);
		return safeResult(dialResult);
	}

	private async scheduleDial(dialCallback: () => SafePromise<MuxedConnection>) {
		if (this.activeDials >= this.dialOpts.maxActiveDials) {
			await new Promise<void>((resolve) => this.dialQueue.push(resolve));
		}
		this.activeDials++;
		const [dialError, result] = await dialCallback();

		this.activeDials--;
		const nextDial = this.dialQueue.shift();
		nextDial?.();

		return dialError ? safeError(dialError) : safeResult(result);
	}

	private onConnect = async (socket: net.Socket, peerAddr: Multiaddr, remotePeerId?: Uint8Array) => {
		const [encryptionError, result] = await safeSyncTry(() =>
			this.encrypter.encryptOutBound(socket, pk2id(remotePeerId)),
		);
		if (encryptionError) {
			return safeError(encryptionError);
		}
		const [connectionError, connection] = safeSyncTry(
			() => new MuxedConnection(result.socket, { remoteAddr: peerAddr }),
		);

		if (connectionError) {
			return safeError(connectionError);
		}
		this.connectionCache.set(peerAddr.toString(), connection);

		return safeResult(connection);
	};

	private checkAndReturnExistingConnection(peerId: Multiaddr) {
		const cachedConnection = this.connectionCache.get(peerId.toString());

		if (cachedConnection && !cachedConnection.socket.destroyed) {
			return safeResult(cachedConnection);
		}

		const existingDial = this.inFlightDials.get(peerId.toString());
		if (existingDial) return existingDial;
	}

	createListener(params: CreateTransportOptions) {
		return new TransportListener({ upgrader: this.encrypter, ...params });
	}
}
