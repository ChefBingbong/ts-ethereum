import { CODE_P2P } from "@multiformats/multiaddr";
import { anySignal, ClearableSignal } from "any-signal";
import { setMaxListeners } from "main-event";
import { ConnectionEncrypter } from "../connection-encrypters/eccies/types";
import * as mss from "../multi-stream-select";
import { MplexStreamMuxer, StreamMuxerFactory } from "../muxer";
import { AbstractMessageStream } from "../stream/default-message-stream";
import { AbstractMultiaddrConnection } from "./abstract-multiaddr-connection";
import { BasicConnection, createBasicConnection } from "./basic-connection";
import { Connection, createConnection } from "./connection";
import { Registrar } from "./registrar";
import { AbortOptions, PeerId } from "./types";

interface CreateConnectionOptions {
	id: string;
	cryptoProtocol: string;
	direction: "inbound" | "outbound";
	maConn: AbstractMultiaddrConnection;
	stream: AbstractMessageStream;
	remotePeer: PeerId;
	muxer?: MplexStreamMuxer;
	closeTimeout?: number;
}

export interface SecuredConnection {
	connection: AbstractMessageStream;
	remotePeer: PeerId;
	protocol: string;
}

export interface UpgraderInit {
	privateKey: Uint8Array;
	id: Uint8Array;
	connectionEncrypter: ConnectionEncrypter | null;
	streamMuxerFactory: StreamMuxerFactory;
	inboundUpgradeTimeout?: number;
	inboundStreamProtocolNegotiationTimeout?: number;
	outboundStreamProtocolNegotiationTimeout?: number;
	connectionCloseTimeout?: number;
	skipEncryptionNegotiation?: boolean; // Skip multi-stream-select for encryption (use direct)
	skipMuxerNegotiation?: boolean; // Skip multi-stream-select for muxer (use direct)
}

export interface UpgraderComponents {
	registrar: Registrar;
}

export const INBOUND_UPGRADE_TIMEOUT = 10_000;
export const PROTOCOL_NEGOTIATION_TIMEOUT = 10_000;
export const CONNECTION_CLOSE_TIMEOUT = 1_000;

export class Upgrader {
	private readonly connectionEncrypter: ConnectionEncrypter | null;
	private readonly streamMuxerFactory: StreamMuxerFactory;
	private readonly inboundUpgradeTimeout: number;
	private readonly inboundStreamProtocolNegotiationTimeout: number;
	private readonly outboundStreamProtocolNegotiationTimeout: number;
	private readonly connectionCloseTimeout: number;
	private readonly components: UpgraderComponents;
	private readonly privateKey: Uint8Array;
	private readonly id: Uint8Array;
	private readonly skipEncryptionNegotiation: boolean;
	private readonly skipMuxerNegotiation: boolean;

	constructor(components: UpgraderComponents, init: UpgraderInit) {
		this.components = components;
		this.privateKey = init.privateKey;
		this.id = init.id;
		this.connectionEncrypter = init.connectionEncrypter;
		this.streamMuxerFactory = init.streamMuxerFactory;
		this.skipEncryptionNegotiation = init.skipEncryptionNegotiation ?? false;
		this.skipMuxerNegotiation = init.skipMuxerNegotiation ?? false;

		this.inboundUpgradeTimeout =
			init.inboundUpgradeTimeout ?? INBOUND_UPGRADE_TIMEOUT;
		this.inboundStreamProtocolNegotiationTimeout =
			init.inboundStreamProtocolNegotiationTimeout ??
			PROTOCOL_NEGOTIATION_TIMEOUT;
		this.outboundStreamProtocolNegotiationTimeout =
			init.outboundStreamProtocolNegotiationTimeout ??
			PROTOCOL_NEGOTIATION_TIMEOUT;
		this.connectionCloseTimeout =
			init.connectionCloseTimeout ?? CONNECTION_CLOSE_TIMEOUT;
	}

	createInboundAbortSignal(signal?: AbortSignal): ClearableSignal {
		const signals: AbortSignal[] = [
			AbortSignal.timeout(this.inboundUpgradeTimeout),
		];
		if (signal) {
			signals.push(signal);
		}
		const output = anySignal(signals);
		setMaxListeners(Infinity, output);
		return output;
	}

	async upgradeInbound(
		maConn: AbstractMultiaddrConnection,
		opts: { signal?: AbortSignal } = {},
	): Promise<Connection> {
		const signal = this.createInboundAbortSignal(opts.signal);

		try {
			return await this._performUpgrade(maConn, "inbound", { signal });
		} finally {
			signal.clear();
		}
	}

	async upgradeOutbound(
		maConn: AbstractMultiaddrConnection,
		opts: { signal?: AbortSignal } = {},
	): Promise<Connection> {
		return await this._performUpgrade(maConn, "outbound", opts);
	}

	/**
	 * Upgrade inbound connection to BasicConnection (no muxing, RLPx compatible)
	 */
	async upgradeInboundBasic(
		maConn: AbstractMultiaddrConnection,
		opts: { signal?: AbortSignal } = {},
	): Promise<BasicConnection> {
		const signal = this.createInboundAbortSignal(opts.signal);

		try {
			return await this._performBasicUpgrade(maConn, "inbound", { signal });
		} finally {
			signal.clear();
		}
	}

	/**
	 * Upgrade outbound connection to BasicConnection (no muxing, RLPx compatible)
	 */
	async upgradeOutboundBasic(
		maConn: AbstractMultiaddrConnection,
		opts: { signal?: AbortSignal } = {},
	): Promise<BasicConnection> {
		return await this._performBasicUpgrade(maConn, "outbound", opts);
	}

	private async _performUpgrade(
		maConn: AbstractMultiaddrConnection,
		direction: "inbound" | "outbound",
		opts: AbortOptions = {},
	): Promise<Connection> {
		let stream: AbstractMessageStream = maConn;
		let remotePeer: PeerId;
		let muxer: MplexStreamMuxer | undefined;
		let cryptoProtocol: string;

		const id = `${(parseInt(String(Math.random() * 1e9))).toString(36)}${Date.now()}`;

		try {
			// Try to extract remote peer ID from multiaddr
			const peerIdString = maConn.remoteAddr
				.getComponents()
				.findLast((c) => c.code === CODE_P2P)?.value;

			// Skip encryption if no encrypter configured (testing mode)
			if (this.connectionEncrypter) {
				// Encrypt the connection DIRECTLY (no multi-stream-select for ECIES)
				// ECIES from RLPx uses a custom handshake, not compatible with multistream-select
				const encrypted =
					direction === "inbound"
						? await this._encryptInboundDirect(stream, opts)
						: await this._encryptOutboundDirect(stream, opts);

				stream = encrypted.connection;
				remotePeer = encrypted.remotePeer;
				cryptoProtocol = encrypted.protocol;
			} else {
				// No encryption - use peer ID from connection options
				const maConnAny = maConn as any;
				remotePeer = maConnAny.remotePeerId || this.id;
				cryptoProtocol = "none";
				maConn.log(
					"skipping encryption (testing mode), remote peer: %s",
					Buffer.from(remotePeer).toString("hex").slice(0, 16),
				);
			}

			// If we had a peer ID in the multiaddr, we could verify it matches here
			// For now we trust the encrypted connection's peer ID

			// Multiplex the connection
			let muxerFactory: StreamMuxerFactory;

			if (this.skipMuxerNegotiation) {
				// Skip multi-stream-select, use muxer directly
				// This is necessary when ECIES encryption is used because the socket is in frame mode
				maConn.log(
					"skipping muxer negotiation, using %s directly",
					this.streamMuxerFactory.protocol,
				);
				muxerFactory = this.streamMuxerFactory;
			} else {
				// Standard libp2p flow with multi-stream-select
				muxerFactory = await (direction === "inbound"
					? this._multiplexInbound(stream, opts)
					: this._multiplexOutbound(stream, opts));
			}

			maConn.log("create muxer %s", muxerFactory.protocol);
			muxer = muxerFactory.createStreamMuxer(stream);
		} catch (err: any) {
			maConn.log.error(
				"failed to upgrade %s connection %s %s - %s",
				direction,
				direction === "inbound" ? "from" : "to",
				maConn.remoteAddr.toString(),
				err.message,
			);
			throw err;
		}

		return this._createConnection({
			id,
			cryptoProtocol,
			direction,
			maConn,
			stream,
			muxer,
			remotePeer,
			closeTimeout: this.connectionCloseTimeout,
		});
	}

	/**
	 * A convenience method for generating a new `Connection`
	 */
	_createConnection(opts: CreateConnectionOptions): Connection {
		const connection = createConnection(this.components, {
			...opts,
			outboundStreamProtocolNegotiationTimeout:
				this.outboundStreamProtocolNegotiationTimeout,
			inboundStreamProtocolNegotiationTimeout:
				this.inboundStreamProtocolNegotiationTimeout,
		});

		return connection;
	}

	/**
	 * Encrypts the incoming connection (DIRECT - no multistream-select)
	 * ECIES uses its own handshake protocol, incompatible with multistream-select
	 */
	async _encryptInboundDirect(
		connection: AbstractMessageStream,
		options: AbortOptions,
	): Promise<SecuredConnection> {
		try {
			connection.log(
				"🔄 [Upgrader] Starting ECIES handshake (inbound) - direct, no multistream-select",
			);

			// Perform actual ECIES encryption handshake
			const maConn = connection as any;
			const socket = maConn.socket;
			if (!socket) {
				throw new Error("No socket available for ECIES encryption");
			}

			connection.log(
				"🔄 [Upgrader] Socket state - destroyed: %s, readable: %s, writable: %s",
				socket.destroyed,
				socket.readable,
				socket.writable,
			);
			connection.log("🔄 [Upgrader] Performing ECIES handshake (inbound)...");

			const secureConn = await this.connectionEncrypter.secureInBound(socket);

			connection.log(
				"✅ [Upgrader] ECIES handshake complete (inbound), remote peer: %s",
				Buffer.from(secureConn.remotePeer).toString("hex").slice(0, 16),
			);

			// NOTE: Do NOT set up RLPx frame parser here - it will be set up after STATUS handshake completes
			// Setting it up too early can interfere with the STATUS handshake
			connection.log(
				"⏸️ [Upgrader] Deferring RLPx frame parser setup until after STATUS handshake",
			);

			// Clear any leftover data in the read buffer after ECIES handshake
			// This ensures a clean stream for multi-stream-select negotiation
			const connectionAny = connection as any;
			if (connectionAny.readBuffer?.byteLength > 0) {
				connection.log(
					"🧹 [Upgrader] Clearing %d bytes of leftover data from read buffer after ECIES handshake",
					connectionAny.readBuffer.byteLength,
				);
				connectionAny.readBuffer.consume(connectionAny.readBuffer.byteLength);
			}

			return {
				connection,
				remotePeer: secureConn.remotePeer,
				protocol: "eccies",
			};
		} catch (err: any) {
			connection.log(
				"❌ [Upgrader] ECIES handshake failed (inbound): %s",
				err.message,
			);
			connection.log("❌ [Upgrader] Error stack: %s", err.stack);
			throw new Error(`Failed to encrypt inbound connection: ${err.message}`);
		}
	}

	/**
	 * Encrypts the outgoing connection (DIRECT - no multistream-select)
	 * ECIES uses its own handshake protocol, incompatible with multistream-select
	 */
	async _encryptOutboundDirect(
		connection: AbstractMessageStream,
		options: AbortOptions,
	): Promise<SecuredConnection> {
		try {
			connection.log(
				"🔄 [Upgrader] Starting ECIES handshake (outbound) - direct, no multistream-select",
			);

			// Perform actual ECIES encryption handshake
			const maConn = connection as any;
			const socket = maConn.socket;
			if (!socket) {
				throw new Error("No socket available for ECIES encryption");
			}

			// For outbound, we need the remote peer ID that was passed to the transport
			const remotePeerId = maConn.remotePeerId;
			if (!remotePeerId) {
				throw new Error("No remote peer ID available for ECIES encryption");
			}

			connection.log(
				"🔄 [Upgrader] Performing ECIES handshake (outbound) with peer %s...",
				Buffer.from(remotePeerId).toString("hex").slice(0, 16),
			);
			connection.log(
				"🔄 [Upgrader] Socket state - destroyed: %s, readable: %s, writable: %s",
				socket.destroyed,
				socket.readable,
				socket.writable,
			);

			const secureConn = await this.connectionEncrypter.secureOutBound(
				socket,
				remotePeerId,
			);

			connection.log(
				"✅ [Upgrader] ECIES handshake complete (outbound), remote peer: %s",
				Buffer.from(secureConn.remotePeer).toString("hex").slice(0, 16),
			);

			// NOTE: Do NOT set up RLPx frame parser here - it will be set up after STATUS handshake completes
			// Setting it up too early can interfere with the STATUS handshake
			connection.log(
				"⏸️ [Upgrader] Deferring RLPx frame parser setup until after STATUS handshake",
			);

			// Clear any leftover data in the read buffer after ECIES handshake
			// This ensures a clean stream for multi-stream-select negotiation
			const connectionAny = connection as any;
			if (connectionAny.readBuffer?.byteLength > 0) {
				connection.log(
					"🧹 [Upgrader] Clearing %d bytes of leftover data from read buffer after ECIES handshake",
					connectionAny.readBuffer.byteLength,
				);
				connectionAny.readBuffer.consume(connectionAny.readBuffer.byteLength);
			}

			return {
				connection,
				remotePeer: secureConn.remotePeer,
				protocol: "eccies",
			};
		} catch (err: any) {
			connection.log(
				"❌ [Upgrader] ECIES handshake failed (outbound): %s",
				err.message,
			);
			connection.log("❌ [Upgrader] Error stack: %s", err.stack);
			throw new Error(`Failed to encrypt outbound connection: ${err.message}`);
		}
	}

	/**
	 * Selects one of the given muxers via multistream-select for outbound
	 */
	async _multiplexOutbound(
		maConn: AbstractMessageStream,
		options: AbortOptions,
	): Promise<StreamMuxerFactory> {
		const protocols = [this.streamMuxerFactory.protocol];

		try {
			const protocol = await mss.select(maConn, protocols, options);

			if (protocol !== this.streamMuxerFactory.protocol) {
				throw new Error(`No muxer configured for protocol "${protocol}"`);
			}

			return this.streamMuxerFactory;
		} catch (err: any) {
			throw new Error(`Failed to negotiate muxer: ${err.message}`);
		}
	}

	/**
	 * Registers support for one of the given muxers via multistream-select for inbound
	 */
	async _multiplexInbound(
		maConn: AbstractMessageStream,
		options: AbortOptions,
	): Promise<StreamMuxerFactory> {
		const protocols = [this.streamMuxerFactory.protocol];

		try {
			const protocol = await mss.handle(maConn, protocols, options);

			if (protocol !== this.streamMuxerFactory.protocol) {
				throw new Error(`No muxer configured for protocol "${protocol}"`);
			}

			return this.streamMuxerFactory;
		} catch (err: any) {
			throw new Error(`Failed to negotiate muxer: ${err.message}`);
		}
	}

	getConnectionEncrypter(): ConnectionEncrypter | null {
		return this.connectionEncrypter;
	}

	getStreamMuxerFactory(): StreamMuxerFactory {
		return this.streamMuxerFactory;
	}

	getComponents(): UpgraderComponents {
		return this.components;
	}

	/**
	 * Perform basic upgrade (encryption only, no muxing)
	 * Creates a BasicConnection compatible with RLPx
	 */
	private async _performBasicUpgrade(
		maConn: AbstractMultiaddrConnection,
		direction: "inbound" | "outbound",
		opts: AbortOptions = {},
	): Promise<BasicConnection> {
		let stream: AbstractMessageStream = maConn;
		let remotePeer: PeerId;
		let cryptoProtocol: string;

		const id = `${(parseInt(String(Math.random() * 1e9))).toString(36)}${Date.now()}`;

		try {
			// Encrypt if encrypter configured
			if (this.connectionEncrypter) {
				const encrypted =
					direction === "inbound"
						? await this._encryptInboundDirect(stream, opts)
						: await this._encryptOutboundDirect(stream, opts);

				stream = encrypted.connection;
				remotePeer = encrypted.remotePeer;
				cryptoProtocol = encrypted.protocol;
			} else {
				// No encryption - use peer ID from connection options
				const maConnAny = maConn as any;
				remotePeer = maConnAny.remotePeerId || this.id;
				cryptoProtocol = "none";
				maConn.log(
					"skipping encryption (testing mode), remote peer: %s",
					Buffer.from(remotePeer).toString("hex").slice(0, 16),
				);
			}

			return createBasicConnection({
				id,
				cryptoProtocol,
				direction,
				maConn,
				stream,
				remotePeer,
				closeTimeout: this.connectionCloseTimeout,
			});
		} catch (err: any) {
			maConn.log.error(
				"failed to upgrade %s basic connection: %s",
				direction,
				err.message,
			);
			throw err;
		}
	}
}

export function createUpgrader(
	components: UpgraderComponents,
	init: UpgraderInit,
): Upgrader {
	return new Upgrader(components, init);
}
