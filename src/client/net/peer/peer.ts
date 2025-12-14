import { EventEmitter } from "eventemitter3";
import type { BlockHeader } from "../../../block";
import type { BasicConnection } from "../../../p2p/connection/basic-connection";
import { Transport } from "../../../p2p/transport/rlpx/transport.ts";
import {
	BIGINT_0,
	bytesToUnprefixedHex,
	short,
	unprefixedHexToBytes,
} from "../../../utils";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import type { Config } from "../../config.ts";
import { Event } from "../../types.ts";
import { AbstractProtocol } from "../protocol/abstract-protocol.ts";
import type { RlpxServer } from "../server";

type Protocol = AbstractProtocol<any>; // Temporary type alias

export interface PeerOptions {
	/* Config */
	config: Config;

	/* Peer id */
	id?: string;

	/* Peer hostname or ip address (for RLPx) */
	host?: string;

	/* Peer port (for RLPx) */
	port?: number;

	/* Peer address */
	address?: string;

	/* Transport name */
	transport?: string;

	/* Pass true if peer initiated connection (default: false) */
	inbound?: boolean;

	/* Supported protocols */
	protocols?: Protocol[];

	/* Server */
	server?: RlpxServer;

	/* Transport instance (for outbound connections) */
	transportInstance?: Transport;
}

/**
 * Network peer (RLPx implementation)
 * @memberof module:net/peer
 */
export class Peer extends EventEmitter {
	public config: Config;
	public id: string;
	public address: string;
	public inbound: boolean;
	public server: RlpxServer | undefined;
	protected transportName: string;
	protected protocols: Protocol[];
	private _idle: boolean;

	// RLPx-specific properties
	private host: string;
	private port: number;
	public basicConnection: BasicConnection | null = null; // Store BasicConnection
	public transportInstance: Transport | null = null; // Store transport for dialing
	public connected: boolean;

	// Protocol storage
	private protocolInstances: Map<string, AbstractProtocol<any>> = new Map();

	public eth?: AbstractProtocol<any>;

	/*
    If the peer is in the PeerPool.
    If true, messages are handled immediately.
    If false, adds incoming messages to handleMessageQueue,
    which are handled after the peer is added to the pool.
  */
	public pooled: boolean = false;

	/**
	 * Create new peer
	 */
	constructor(options: PeerOptions) {
		super();

		this.config = options.config;
		this.id = options.id ?? "";
		this.inbound = options.inbound ?? false;
		this.protocols = options.protocols ?? [];
		this._idle = true;

		// RLPx-specific initialization
		this.host = options.host ?? "";
		this.port = options.port ?? 0;
		this.address = options.address ?? `${this.host}:${this.port}`;
		this.transportName = options.transport ?? "rlpx";
		this.transportInstance = options.transportInstance ?? null;
		this.connected = false;
	}

	/**
	 * Return RLPx capabilities for the specified protocols
	 * Creates capability objects directly without devp2p dependency
	 * @param protocols protocol instances
	 */
	static capabilities(
		protocols: Protocol[],
	): Array<{ name: string; version: number; length: number; offset: number }> {
		const capabilities: Array<{
			name: string;
			version: number;
			length: number;
			offset: number;
		}> = [];
		let offset = 0;

		for (const protocol of protocols) {
			const { name, versions } = protocol.spec;
			for (const version of versions) {
				// Calculate length based on protocol name and version
				// ETH protocol length varies by version (eth62: 8, eth63+: 17)
				const length =
					name === "eth" && version >= 63 ? 17 : name === "eth" ? 8 : 8;

				capabilities.push({
					name,
					version,
					length,
					offset: offset++,
				});
			}
		}
		return capabilities;
	}

	/**
	 * Get idle state of peer
	 */
	get idle() {
		return this._idle;
	}

	/**
	 * Set idle state of peer
	 */
	set idle(value) {
		this._idle = value;
	}

	/**
	 * Initiate peer connection
	 * Uses new RLPx transport if available, otherwise falls back to devp2p RLPx
	 */
	async connect(): Promise<void> {
		if (this.connected) {
			this.config.logger?.debug(
				`[Peer.connect] Peer ${this.id.slice(0, 8)} already connected, skipping`,
			);
			return;
		}

		this.config.logger?.info(
			`[Peer.connect] 🔌 Initiating OUTBOUND connection to peer ${this.id.slice(0, 8)} at ${this.host}:${this.port}`,
		);

		await Promise.all(this.protocols.map((p) => p.open()));

		// Use new transport if available
		if (this.transportInstance) {
			try {
				const peerAddr = ipPortToMultiaddr(this.host, this.port);
				const peerIdBytes = unprefixedHexToBytes(this.id);

				this.config.logger?.debug(
					`[Peer.connect] 📍 Dialing peer at ${peerAddr.toString()}, peerId=${this.id.slice(0, 16)}...`,
				);

				const result = await this.transportInstance.dialBasic(
					peerAddr,
					peerIdBytes,
				);

				// Check result type (SafeResult is [undefined, T], SafeError is [E, undefined])
				if (result[0] !== undefined) {
					this.config.logger?.error(
						`[Peer.connect] ❌ Dial failed for peer ${this.id.slice(0, 8)}: ${result[0]}`,
					);
					throw result[0]; // Error case
				}

				const basicConn = result[1]; // Success case
				this.config.logger?.info(
					`[Peer.connect] ✅ Dial successful! BasicConnection established to peer ${this.id.slice(0, 8)}`,
				);

				this.basicConnection = basicConn;
				this.config.logger?.debug(
					`[Peer.connect] 🔗 BasicConnection details: remotePeer=${bytesToUnprefixedHex(basicConn.remotePeer).slice(0, 8)}, remoteAddr=${basicConn.remoteAddr.toString()}`,
				);
				this.config.logger?.debug(
					`[Peer.connect] 🔗 Binding protocols to connection...`,
				);
				await this.bindProtocols(basicConn);

				this.connected = true;
				this.config.logger?.info(
					`[Peer.connect] 🎉 Peer ${this.id.slice(0, 8)} fully connected and protocols bound!`,
				);
				this.config.events.emit(Event.PEER_CONNECTED, this);

				// Listen for connection close
				basicConn.addEventListener("close", () => {
					this.config.logger?.warn(
						`[Peer.connect] 🔌 Connection closed for peer ${this.id.slice(0, 8)}`,
					);
					this.connected = false;
					this.basicConnection = null;
					this.config.events.emit(Event.PEER_DISCONNECTED, this);
				});
			} catch (error: any) {
				console.log(error);
				this.config.logger?.error(
					`[Peer.connect] ❌ Connection failed for peer ${this.id.slice(0, 8)}: ${error.message || error}`,
				);
				this.config.events.emit(Event.PEER_ERROR, error, this);
				throw error;
			}
		} else {
			const err = new Error(
				"No transport instance available for outbound connection. Transport must be provided in PeerOptions.",
			);
			this.config.logger?.error(`[Peer.connect] ❌ ${err.message}`);
			throw err;
		}
	}

	/**
	 * Accept new peer connection from an rlpx server
	 * @param basicConn BasicConnection from TransportListener
	 */
	async accept(basicConn: BasicConnection, server: RlpxServer): Promise<void> {
		if (this.connected) {
			this.config.logger?.debug(
				`[Peer.accept] Peer ${this.id.slice(0, 8)} already connected, skipping`,
			);
			return;
		}

		this.config.logger?.info(
			`[Peer.accept] 📥 Accepting INBOUND connection from peer ${this.id.slice(0, 8)}`,
		);
		this.basicConnection = basicConn;

		this.config.logger?.debug(
			`[Peer.accept] 🔗 Binding protocols to inbound connection...`,
		);
		await this.bindProtocols(basicConn);

		this.connected = true;
		this.server = server;
		this.config.logger?.info(
			`[Peer.accept] 🎉 Inbound peer ${this.id.slice(0, 8)} fully accepted and protocols bound!`,
		);
	}

	/**
	 * Adds protocols to this peer given a BasicConnection.
	 * @param basicConn BasicConnection from RLPx transport
	 */
	private async bindProtocols(basicConn: BasicConnection): Promise<void> {
		this.basicConnection = basicConn;

		this.config.logger?.debug(
			`[Peer.bindProtocols] 📋 Binding ${this.protocols.length} protocol(s) for peer ${this.id.slice(0, 8)}`,
		);

		// // Set up RLPx frame parser BEFORE setting up protocols
		// // This is required to read the STATUS response
		// const maConn = (basicConn as any).maConn;
		// if (
		// 	maConn?.setupFrameParser &&
		// 	typeof maConn.setupFrameParser === "function"
		// ) {
		// 	this.config.logger?.debug(
		// 		`[Peer.bindProtocols] 🔄 Setting up RLPx frame parser`,
		// 	);
		// 	maConn.setupFrameParser();
		// }

		// For each protocol in this.protocols, bind it to the connection
		await Promise.all(
			this.protocols.map(async (protocolTemplate) => {
				const name = protocolTemplate.spec.name;
				const protocol = protocolTemplate;

				// Store peer reference in protocol
				protocol._peer = this;

				// Set up transport context with BasicConnection
				// EthProtocol.setupTransport() will create adapter internally and handle STATUS automatically
				protocol.setupTransport(basicConn);

				// For handshake, use the protocol adapter directly
				// The protocol adapter already handles STATUS messages via setupTransport
				// We just need to trigger the handshake if we're the initiator
				if (!this.inbound) {
					// Outbound: we initiate the handshake
					this.config.logger?.debug(
						`[Peer.bindProtocols] 🤝 Starting handshake for protocol ${name} with peer ${this.id.slice(0, 8)}`,
					);
					const sender = (protocol as any)._createSenderFromAdapter?.();
					if (sender) {
						await protocol.handshake(sender);
						this.config.logger?.debug(
							`[Peer.bindProtocols] ✅ Handshake completed for protocol ${name} with peer ${this.id.slice(0, 8)}`,
						);
					}
				} else {
					// Inbound: remote peer will initiate, we just wait
					this.config.logger?.debug(
						`[Peer.bindProtocols] ⏳ Waiting for remote peer to initiate handshake for protocol ${name}`,
					);
				}

				// Forward protocol "message" events to PROTOCOL_MESSAGE
				protocol.on("message", (code: number, payload: any) => {
					const messageName =
						(protocol as any)._getMessageName?.(code) || `UNKNOWN_${code}`;
					this.config.events.emit(
						Event.PROTOCOL_MESSAGE,
						{
							name: messageName,
							data: payload,
							code: code,
						},
						name,
						this,
					);
				});

				this.protocolInstances.set(name, protocol);
				if (name === "eth") {
					this.eth = protocol;
				}
			}),
		);

		this.connected = true;
	}

	/**
	 * Eventually updates and returns the latest header of peer
	 */
	async latest(): Promise<BlockHeader | undefined> {
		if (!this.eth) {
			return;
		}
		const ethProtocol = this.eth as any;
		if (!ethProtocol) return undefined;
		let block: bigint | Uint8Array;
		if (!ethProtocol.updatedBestHeader) {
			// If there is no updated best header stored yet, start with the status hash
			block = ethProtocol.status.bestHash;
		} else {
			block = this.getPotentialBestHeaderNum();
		}
		const result = await ethProtocol.getBlockHeaders({
			block,
			max: 1,
		});
		if (result !== undefined) {
			const latest = result[1][0];
			ethProtocol.updatedBestHeader = latest;
			if (latest !== undefined) {
				const height = latest.number;
				if (
					height > BIGINT_0 &&
					(this.config.syncTargetHeight === undefined ||
						this.config.syncTargetHeight === BIGINT_0 ||
						this.config.syncTargetHeight < latest.number)
				) {
					this.config.syncTargetHeight = height;
					this.config.logger?.info(
						`New sync target height=${height} hash=${short(latest.hash())}`,
					);
				}
			}
		}
		return ethProtocol.updatedBestHeader;
	}

	/**
	 * Returns a potential best block header number for the peer
	 * (not necessarily verified by block request) derived from
	 * either the client-wide sync target height or the last best
	 * header timestamp "forward-calculated" by block/slot times (12s).
	 */
	getPotentialBestHeaderNum(): bigint {
		let forwardCalculatedNum = BIGINT_0;
		const bestSyncTargetNum = this.config.syncTargetHeight ?? BIGINT_0;
		const ethProtocol = this.eth as any;
		if (ethProtocol?.updatedBestHeader !== undefined) {
			const bestHeaderNum = ethProtocol.updatedBestHeader.number;
			const nowSec = Math.floor(Date.now() / 1000);
			const diffSec = nowSec - Number(ethProtocol.updatedBestHeader.timestamp);
			const SLOT_TIME = 12;
			const diffBlocks = BigInt(Math.floor(diffSec / SLOT_TIME));
			forwardCalculatedNum = bestHeaderNum + diffBlocks;
		}
		const best =
			forwardCalculatedNum > bestSyncTargetNum
				? forwardCalculatedNum
				: bestSyncTargetNum;
		return best;
	}

	/**
	 * Add a protocol to this peer
	 * @param protocol The protocol implementation (must extend AbstractProtocol)
	 */
	async addProtocol(protocol: AbstractProtocol<any>): Promise<void> {
		if (!protocol || typeof protocol.setupTransport !== "function") {
			throw new Error(
				"Protocol must extend AbstractProtocol and implement setupTransport",
			);
		}

		// Protocol setup will be done when bindProtocols is called
		// For now, just store it
		this.protocolInstances.set(protocol.spec.name, protocol);
		if (protocol.spec.name === "eth") {
			this.eth = protocol;
		}
	}

	/**
	 * Get a protocol instance by name
	 */
	getProtocol(name: string): AbstractProtocol<any> | undefined {
		return this.protocolInstances.get(name);
	}

	toString(withFullId = false): string {
		const properties = {
			id: withFullId ? this.id : this.id.substr(0, 8),
			address: this.address,
			transport: this.transportName,
			protocols: Array.from(this.protocolInstances.keys()),
			inbound: this.inbound,
		};
		return Object.entries(properties)
			.filter(
				([, value]) =>
					value !== undefined && value !== null && value.toString() !== "",
			)
			.map((keyValue) => keyValue.join("="))
			.join(" ");
	}
}
