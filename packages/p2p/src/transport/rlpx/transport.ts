/**
 * RLPx Transport - libp2p-style transport for Ethereum's RLPx protocol
 *
 * This transport handles ECIES encryption and Hello handshake,
 * bypassing the standard multistream-select flow since RLPx has
 * its own protocol negotiation mechanism.
 */

import type { Listener, Logger, Transport } from "@libp2p/interface";
import {
	AbortError,
	serviceCapabilities,
	TimeoutError,
	transportSymbol,
} from "@libp2p/interface";
import type { Multiaddr } from "@multiformats/multiaddr";
import { TCP as TCPMatcher } from "@multiformats/multiaddr-matcher";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import type { IpcSocketConnectOpts, Socket, TcpSocketConnectOpts } from "net";
import net from "net";
import os from "os";
import { CustomProgressEvent } from "progress-events";
// import type { ProtocolStream } from "../../../client/net/protocol/protocol-stream.ts";
import { bytesToUnprefixedHex, utf8ToBytes } from "../../../utils/index.ts";
import { multiaddrToNetConfig } from "../tcp/utils.ts";
import { RLPxConnection } from "./connection.ts";
import { RLPxListener } from "./listener.ts";
import type {
	RLPxComponents,
	RLPxCreateListenerOptions,
	RLPxDialEvents,
	RLPxDialOptions,
	RLPxMetrics,
	RLPxTransportOptions,
} from "./types.ts";

const log = debug("p2p:rlpx:transport1");
/**
 * Get node ID from private key (public key without 0x04 prefix)
 */
function pk2id(privateKey: Uint8Array): Uint8Array {
	return secp256k1.getPublicKey(privateKey, false).slice(1);
}

/**
 * RLPx Transport - Implements libp2p Transport interface for Ethereum RLPx
 */
export class RLPxTransport implements Transport<RLPxDialEvents> {
	private readonly opts: RLPxTransportOptions;
	private readonly metrics?: RLPxMetrics;
	private readonly components: RLPxComponents;
	private readonly log: Logger;
	private readonly nodeId: Uint8Array;
	private readonly clientId: Uint8Array;
	private readonly listeningPort: number;

	constructor(
		components: RLPxComponents,
		options: RLPxTransportOptions & { listeningPort?: number },
	) {
		this.log = components.logger.forComponent("rlpx:transport");
		this.opts = options;
		this.components = components;
		this.listeningPort = options.listeningPort ?? 0;
		// Derive node ID from private key
		this.nodeId = pk2id(options.privateKey);

		// Set client ID
		this.clientId =
			options.clientId ??
			utf8ToBytes(`ethereumjs-devp2p/${os.platform()}-${os.arch()}/nodejs`);

		// Setup metrics if available
		if (components.metrics != null) {
			this.metrics = {
				events: components.metrics.registerCounterGroup(
					"libp2p_rlpx_dialer_events_total",
					{
						label: "event",
						help: "Total count of RLPx dialer events by type",
					},
				),
				errors: components.metrics.registerCounterGroup(
					"libp2p_rlpx_dialer_errors_total",
					{
						label: "event",
						help: "Total count of RLPx dialer errors by type",
					},
				),
			};
		}

		this.log(
			"initialized RLPx transport with node ID %s",
			bytesToUnprefixedHex(this.nodeId).slice(0, 16) + "...",
		);
	}

	readonly [transportSymbol] = true;

	readonly [Symbol.toStringTag] = "@libp2p/rlpx";

	readonly [serviceCapabilities]: string[] = ["@libp2p/transport"];

	/**
	 * Dial a peer using RLPx protocol
	 *
	 * Note: Unlike standard libp2p transports, RLPx requires the remote
	 * node ID (public key) to initiate the ECIES handshake.
	 *
	 * @param ma - Multiaddr to dial
	 * @param options - Dial options including required remoteId
	 * @returns Promise resolving to RLPxConnection after Hello exchange
	 */
	async dial(ma: Multiaddr, options: RLPxDialOptions): Promise<RLPxConnection> {
		options.keepAlive = options.keepAlive ?? true;
		options.noDelay = options.noDelay ?? true;
		options.allowHalfOpen = options.allowHalfOpen ?? false;

		if (!options.remoteId) {
			throw new Error("RLPx dial requires remoteId (remote node public key)");
		}

		this.log(
			"dialing %a with node ID %s",
			ma,
			bytesToUnprefixedHex(options.remoteId).slice(0, 16) + "...",
		);

		// Establish TCP connection
		const socket = await this._connect(ma, options);

		let connection: RLPxConnection;

		try {
			options.onProgress?.(new CustomProgressEvent("rlpx:ecies-auth"));

			// Create RLPx connection (initiates auth)
			connection = new RLPxConnection({
				socket,
				privateKey: this.opts.privateKey,
				nodeId: this.nodeId,
				remoteId: options.remoteId,
				clientId: this.clientId,
				capabilities: this.opts.capabilities,
				common: this.opts.common,
				// Timeout should be longer than PING_INTERVAL (15s) to prevent premature disconnects
				// Use at least 20 seconds to allow for PING messages every 15 seconds
				timeout: this.opts.timeout ?? 20000,
				listenPort: this.listeningPort, // Our listen port (if any)
				remoteClientIdFilter: this.opts.remoteClientIdFilter,
				useEIP8: options.useEIP8 ?? true,
				direction: "outbound",
				logger: this.components.logger,
				inactivityTimeout: this.opts.outboundSocketInactivityTimeout,
			});
		} catch (err: any) {
			this.metrics?.errors.increment({ outbound_to_connection: true });
			socket.destroy(err);
			throw err;
		}

		// Wait for Hello exchange to complete
		try {
			options.onProgress?.(new CustomProgressEvent("rlpx:hello-exchange"));

			await this._waitForConnect(connection, options);

			options.onProgress?.(new CustomProgressEvent("rlpx:connected"));

			this.log(
				"connected to %a (remote client: %s)",
				ma,
				connection.getHelloMessage()?.clientId ?? "unknown",
			);

			this.metrics?.events.increment({ connect: true });

			return connection;
		} catch (err: any) {
			this.metrics?.errors.increment({ outbound_upgrade: true });
			this.log.error("error connecting to peer - %e", err);
			connection.close();
			throw err;
		}
	}

	/**
	 * Dial a peer and get a protocol stream
	 * Similar to libp2p's dialProtocol
	 *
	 * @param ma Multiaddr to dial
	 * @param protocol Protocol string (e.g., "/eth/68/1.0.0")
	 * @param options Dial options including required remoteId
	 * @returns Promise resolving to ProtocolStream after Hello exchange and protocol negotiation
	 *
	 * @example
	 * ```typescript
	 * const stream = await transport.dialProtocol(
	 *   multiaddr('/ip4/1.2.3.4/tcp/30303'),
	 *   '/eth/68/1.0.0',
	 *   { remoteId: peerNodeId }
	 * );
	 *
	 * stream.onMessage((code, payload) => {
	 *   console.log('Received:', code, payload);
	 * });
	 *
	 * stream.send(0x03, encodedGetBlockHeaders);
	 * ```
	 */
	// async dialProtocol(
	// 	ma: Multiaddr,
	// 	protocol: string,
	// 	options: RLPxDialOptions,
	// ): Promise<ProtocolStream> {
	// 	// First dial the connection
	// 	const connection = await this.dial(ma, options);

	// 	// Parse protocol string (e.g., "/eth/68/1.0.0")
	// 	const match = protocol.match(/^\/(\w+)\/(\d+)\//);
	// 	if (!match) {
	// 		connection.close();
	// 		throw new Error(`Invalid protocol string: ${protocol}`);
	// 	}

	// 	const protocolName = match[1];
	// 	const version = parseInt(match[2], 10);

	// 	// Wait for connection to be ready (Hello exchange complete)
	// 	if (!connection.isConnected()) {
	// 		await new Promise<void>((resolve, reject) => {
	// 			const timeout = setTimeout(() => {
	// 				reject(new Error("Connection timeout"));
	// 				// Timeout should be longer than PING_INTERVAL (15s) to prevent premature disconnects
	// 			}, this.opts.timeout ?? 20000);

	// 			connection.once("connect", () => {
	// 				clearTimeout(timeout);
	// 				resolve();
	// 			});

	// 			connection.once("error", (err) => {
	// 				clearTimeout(timeout);
	// 				reject(err);
	// 			});
	// 		});
	// 	}

	// 	// Get protocol stream
	// 	const stream = connection.getProtocolStream(protocolName, version);
	// 	if (!stream) {
	// 		connection.close();
	// 		const availableProtocols = connection
	// 			.getProtocols()
	// 			.map((p) => p.constructor.name)
	// 			.join(", ");
	// 		throw new Error(
	// 			`Protocol ${protocol} not negotiated. Available: ${availableProtocols}`,
	// 		);
	// 	}

	// 	return stream;
	// }

	/**
	 * Establish TCP connection
	 */
	private async _connect(
		ma: Multiaddr,
		options: RLPxDialOptions,
	): Promise<Socket> {
		options.signal?.throwIfAborted();
		options.onProgress?.(new CustomProgressEvent("rlpx:open-connection"));

		let rawSocket: Socket;

		return new Promise<Socket>((resolve, reject) => {
			const start = Date.now();
			const cOpts = multiaddrToNetConfig(ma, {
				...(options as any),
			}) as IpcSocketConnectOpts & TcpSocketConnectOpts;

			this.log("connecting to %a with opts %o", ma, cOpts);
			rawSocket = net.connect(cOpts);

			const onError = (err: Error): void => {
				this.log.error("dial to %a errored - %e", ma, err);
				const cOptsStr = cOpts.path ?? `${cOpts.host ?? ""}:${cOpts.port}`;
				err.message = `connection error ${cOptsStr}: ${err.message}`;
				this.metrics?.events.increment({ error: true });
				done(err);
			};

			const onTimeout = (): void => {
				this.log("connection timeout %a", ma);
				this.metrics?.events.increment({ timeout: true });

				const err = new TimeoutError(
					`Connection timeout after ${Date.now() - start}ms`,
				);
				rawSocket.emit("error", err);
			};

			const onConnect = (): void => {
				this.log("TCP connection opened %a", ma);
				this.metrics?.events.increment({ connect: true });
				done();
			};

			const onAbort = (): void => {
				this.log("connection aborted %a", ma);
				this.metrics?.events.increment({ abort: true });
				done(new AbortError());
			};

			const done = (err?: Error): void => {
				rawSocket.removeListener("error", onError);
				rawSocket.removeListener("timeout", onTimeout);
				rawSocket.removeListener("connect", onConnect);

				if (options.signal != null) {
					options.signal.removeEventListener("abort", onAbort);
				}

				if (err != null) {
					reject(err);
					return;
				}

				resolve(rawSocket);
			};

			rawSocket.on("error", onError);
			rawSocket.on("timeout", onTimeout);
			rawSocket.on("connect", onConnect);

			if (options.signal != null) {
				options.signal.addEventListener("abort", onAbort);
			}
		}).catch((err) => {
			rawSocket?.destroy();
			throw err;
		});
	}

	/**
	 * Wait for RLPx connection to complete Hello exchange
	 */
	private async _waitForConnect(
		connection: RLPxConnection,
		options: RLPxDialOptions,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				reject(new TimeoutError("RLPx handshake timeout"));
			}, this.opts.timeout ?? 10000);

			const onConnect = (): void => {
				cleanup();
				resolve();
			};

			const onClose = (reason: number | undefined): void => {
				cleanup();
				reject(new Error(`Connection closed: reason ${reason}`));
			};

			const onError = (err: Error): void => {
				cleanup();
				reject(err);
			};

			const onAbort = (): void => {
				cleanup();
				reject(new AbortError());
			};

			const cleanup = (): void => {
				clearTimeout(timeout);
				connection.off("connect", onConnect);
				connection.off("close", onClose);
				connection.off("error", onError);
				options.signal?.removeEventListener?.("abort", onAbort);
			};

			connection.once("connect", onConnect);
			connection.once("close", onClose);
			connection.once("error", onError);

			if (options.signal != null) {
				options.signal.addEventListener("abort", onAbort);
			}
		});
	}

	/**
	 * Create an RLPx listener for inbound connections
	 */
	createListener(
		options: RLPxCreateListenerOptions & { listeningPort?: number },
	): Listener {
		return new RLPxListener({
			...options,
			privateKey: this.opts.privateKey,
			nodeId: this.nodeId,
			clientId: this.clientId,
			capabilities: this.opts.capabilities,
			common: this.opts.common,
			// Timeout should be longer than PING_INTERVAL (15s) to prevent premature disconnects
			// Use at least 20 seconds to allow for PING messages every 15 seconds
			timeout: this.opts.timeout ?? 20000,
			listenPort: options.listeningPort ?? 0, // Will be set when listen() is called
			remoteClientIdFilter: this.opts.remoteClientIdFilter,
			maxConnections: this.opts.maxConnections,
			backlog: this.opts.backlog,
			closeServerOnMaxConnections: this.opts.closeServerOnMaxConnections,
			inactivityTimeout: this.opts.inboundSocketInactivityTimeout,
			metrics: this.components.metrics,
			logger: this.components.logger,
		});
	}

	/**
	 * Filter multiaddrs for valid TCP addresses (RLPx uses TCP)
	 */
	listenFilter(multiaddrs: Multiaddr[]): Multiaddr[] {
		return multiaddrs.filter(
			(ma) => TCPMatcher.exactMatch(ma) || ma.toString().startsWith("/unix/"),
		);
	}

	/**
	 * Filter multiaddrs for dialing
	 */
	dialFilter(multiaddrs: Multiaddr[]): Multiaddr[] {
		return this.listenFilter(multiaddrs);
	}

	/**
	 * Get node ID
	 */
	getNodeId(): Uint8Array {
		return this.nodeId;
	}

	/**
	 * Get client ID
	 */
	getClientId(): Uint8Array {
		return this.clientId;
	}
}

/**
 * Create an RLPx transport factory function
 */
export function rlpx(
	init: RLPxTransportOptions,
): (components: RLPxComponents) => RLPxTransport {
	return (components: RLPxComponents) => {
		return new RLPxTransport(components, init);
	};
}
