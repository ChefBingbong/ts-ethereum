import { EventEmitter } from "eventemitter3";
import type { Connection } from "../../../p2p/connection";
import {
	createRlpxConnection,
	type RlpxConnection,
} from "../../../p2p/transport/rlpx/RlpxConnection";
import { EthProtocolHandler } from "../../../p2p/transport/rlpx/protocols/eth-protocol-handler";
import { Transport } from "../../../p2p/transport/rlpx/transport.ts";
import {
	bytesToUnprefixedHex,
	unprefixedHexToBytes,
} from "../../../utils";
import { ipPortToMultiaddr } from "../../../utils/multi-addr";
import type { Config } from "../../config.ts";
import { Event } from "../../types.ts";
import type { RlpxServer } from "../server";

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
	private _idle: boolean;

	// RLPx-specific properties
	private host: string;
	private port: number;
	public connection: Connection | null = null; // Store Connection
	public transportInstance: Transport | null = null; // Store transport for dialing
	public connected: boolean;

	// RlpxConnection for new protocol handler system
	public rlpxConnection?: RlpxConnection;
	private registeredProtocols: Set<string> = new Set();

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

		// Use new transport if available
		if (this.transportInstance) {
			try {
				const peerAddr = ipPortToMultiaddr(this.host, this.port);
				const peerIdBytes = unprefixedHexToBytes(this.id);

				this.config.logger?.debug(
					`[Peer.connect] 📍 Dialing peer at ${peerAddr.toString()}, peerId=${this.id.slice(0, 16)}...`,
				);

				const result = await this.transportInstance.dial(
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
					`[Peer.connect] ✅ Dial successful! Connection established to peer ${this.id.slice(0, 8)}`,
				);

				this.connection = basicConn;
				this.config.logger?.debug(
					`[Peer.connect] 🔗 Connection details: remotePeer=${bytesToUnprefixedHex((basicConn as any).remotePeer).slice(0, 8)}, remoteAddr=${(basicConn as any).remoteAddr?.toString() ?? 'unknown'}`,
				);
				
				// Upgrade to RlpxConnection and register protocols
				this.config.logger?.debug(
					`[Peer.connect] 🔗 Upgrading to RlpxConnection and registering protocols...`,
				);
				await this.upgradeToRlpxConnection(basicConn);

				this.connected = true;
				this.config.logger?.info(
					`[Peer.connect] 🎉 Peer ${this.id.slice(0, 8)} fully connected and protocols bound!`,
				);
				this.config.events.emit(Event.PEER_CONNECTED, this);

				// Listen for connection close
				(basicConn as any).addEventListener("close", () => {
					this.config.logger?.warn(
						`[Peer.connect] 🔌 Connection closed for peer ${this.id.slice(0, 8)}`,
					);
					this.connected = false;
					this.connection = null;
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
	 * @param basicConn Connection from TransportListener
	 */
	async accept(basicConn: Connection, server: RlpxServer): Promise<void> {
		if (this.connected) {
			this.config.logger?.debug(
				`[Peer.accept] Peer ${this.id.slice(0, 8)} already connected, skipping`,
			);
			return;
		}

		this.config.logger?.info(
			`[Peer.accept] 📥 Accepting INBOUND connection from peer ${this.id.slice(0, 8)}`,
		);
		this.connection = basicConn;

		// Upgrade to RlpxConnection and register protocols
		this.config.logger?.debug(
			`[Peer.accept] 🔗 Upgrading to RlpxConnection and registering protocols...`,
		);
		await this.upgradeToRlpxConnection(basicConn);

		this.connected = true;
		this.server = server;
		this.config.logger?.info(
			`[Peer.accept] 🎉 Inbound peer ${this.id.slice(0, 8)} fully accepted and protocols bound!`,
		);
	}


	/**
	 * Get the latest block header from this peer (via RlpxConnection)
	 */
	async latest(): Promise<any | undefined> {
		if (!this.rlpxConnection) {
			return;
		}

		// Get ETH handler
		const protocols = this.rlpxConnection.protocols;
		const ethDescriptor = protocols.get('eth');
		const ethHandler = ethDescriptor?.handler as any; // EthProtocolHandler

		if (!ethHandler || typeof ethHandler.getBlockHeaders !== 'function') {
			return;
		}

		// Try to get block headers for latest
		try {
			// Use a large block number to get latest (or we could use status.bestHash)
			// For now, request from a very high number which should return the latest
			const result = await ethHandler.getBlockHeaders({
				startBlock: BigInt(Number.MAX_SAFE_INTEGER),
				maxHeaders: 1,
				skip: 0,
				reverse: true,
			});
			if (Array.isArray(result) && result.length === 2 && result[1].length > 0) {
				return result[1][0];
			}
			return undefined;
		} catch (error: any) {
			this.config.logger?.debug(
				`[Peer ${this.id.slice(0, 8)}] Failed to get latest header: ${error.message}`
			);
			return undefined;
		}
	}

	toString(withFullId = false): string {
		const properties = {
			id: withFullId ? this.id : this.id.substr(0, 8),
			address: this.address,
			transport: this.transportName,
			protocols: Array.from(this.registeredProtocols),
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

	/**
	 * Convert Connection to RlpxConnection and register protocols
	 */
	private async upgradeToRlpxConnection(basicConn: Connection): Promise<void> {
		// Convert Connection to RlpxConnection
		// The factory will create a registrar if not provided
		// For now, we let it create one per connection (fine since RLPx doesn't use registrar for routing)
		this.rlpxConnection = createRlpxConnection({
			id: (basicConn as any).id,
			maConn: (basicConn as any).maConn,
			stream: (basicConn as any).stream,
			remotePeer: (basicConn as any).remotePeer,
			direction: this.inbound ? 'inbound' : 'outbound',
			cryptoProtocol: 'eccies',
		});

		// Register protocols
		await this.registerProtocols();

		// Set up event listeners
		this.setupConnectionListeners();
		
		// Note: STATUS handshake will be initiated by the service after peer is added to pool
		// This allows the service to provide chain data for STATUS payload
	}

	/**
	 * Register protocols on RlpxConnection
	 */
	private async registerProtocols(): Promise<void> {
		if (!this.rlpxConnection) {
			throw new Error('RlpxConnection not initialized');
		}

		// Register ETH protocol
		const ethHandler = this.createEthProtocolHandler();
		const ethOffset = await this.rlpxConnection.registerProtocol(ethHandler);
		this.registeredProtocols.add('eth');

		this.config.logger?.info(
			`[Peer ${this.id.slice(0, 8)}] Registered ETH protocol at offset 0x${ethOffset.toString(16)}`
		);

		// Can register more protocols here (LES, SNAP, etc.)
	}

	/**
	 * Create ETH protocol handler and bind to service methods
	 */
	private createEthProtocolHandler(): EthProtocolHandler {
		const handler = new EthProtocolHandler(68);

		// Set up STATUS provider so handler can send our STATUS when receiving peer STATUS
		// This allows the handler to respond to STATUS messages automatically
		handler.setStatusProvider(() => {
			// Get chain from server/service
			const server = this.server;
			if (!server) {
				throw new Error('Cannot provide STATUS: no server available');
			}
			
			// Get chain from server's service
			const service = (server as any).service;
			if (!service || !service.chain) {
				throw new Error('Cannot provide STATUS: no chain available');
			}
			
			const chain = service.chain;
			const latestBlock = chain.blocks.latest;
			if (!latestBlock) {
				throw new Error('Cannot provide STATUS: chain has no latest block');
			}
			
			return {
				protocolVersion: 67, // eth/68
				networkId: chain.chainId,
				td: chain.blocks.td,
				bestHash: latestBlock.hash(),
				genesisHash: chain.genesis.hash(),
				forkID: undefined, // TODO: Add forkID support if needed
			};
		});

		// Bind handlers to service methods
		// The service will listen to events emitted by the protocol handler
		// via the connection's event system

		return handler;
	}

	/**
	 * Set up connection event listeners
	 */
	private setupConnectionListeners(): void {
		if (!this.rlpxConnection) {
			return;
		}

		// Listen for connection close
		(this.rlpxConnection as any).addEventListener('close', () => {
			this.config.logger?.info(`[Peer ${this.id.slice(0, 8)}] RlpxConnection closed`);
			this.connected = false;
			this.rlpxConnection = undefined;
			this.registeredProtocols.clear();
		});

		// Listen for ETH protocol events (cast to any for custom events)
		const conn = this.rlpxConnection as any;

		conn.addEventListener('eth:status', ((evt: CustomEvent) => {
			const status = evt.detail;
			this.config.events.emit(Event.ETH_STATUS, status, this);
		}) as EventListener);

		conn.addEventListener('eth:newBlockHashes', ((evt: CustomEvent) => {
			const hashes = evt.detail;
			this.config.events.emit(Event.ETH_NEW_BLOCK_HASHES, hashes, this);
		}) as EventListener);

		conn.addEventListener('eth:transactions', ((evt: CustomEvent) => {
			const txs = evt.detail;
			this.config.events.emit(Event.ETH_TRANSACTIONS, txs, this);
		}) as EventListener);

		conn.addEventListener('eth:newBlock', ((evt: CustomEvent) => {
			const block = evt.detail;
			this.config.events.emit(Event.ETH_NEW_BLOCK, block, this);
		}) as EventListener);

		conn.addEventListener('eth:getBlockHeaders', ((evt: CustomEvent) => {
			const request = evt.detail;
			this.config.events.emit(Event.ETH_GET_BLOCK_HEADERS, request, this);
		}) as EventListener);

		conn.addEventListener('eth:blockHeaders', ((evt: CustomEvent) => {
			const headers = evt.detail;
			this.config.events.emit(Event.ETH_BLOCK_HEADERS, headers, this);
		}) as EventListener);

		conn.addEventListener('eth:getBlockBodies', ((evt: CustomEvent) => {
			const request = evt.detail;
			this.config.events.emit(Event.ETH_GET_BLOCK_BODIES, request, this);
		}) as EventListener);

		conn.addEventListener('eth:blockBodies', ((evt: CustomEvent) => {
			const bodies = evt.detail;
			this.config.events.emit(Event.ETH_BLOCK_BODIES, bodies, this);
		}) as EventListener);

		conn.addEventListener('eth:getPooledTransactions', ((evt: CustomEvent) => {
			const request = evt.detail;
			this.config.events.emit(Event.ETH_GET_POOLED_TRANSACTIONS, request, this);
		}) as EventListener);

		conn.addEventListener('eth:pooledTransactions', ((evt: CustomEvent) => {
			const txs = evt.detail;
			this.config.events.emit(Event.ETH_POOLED_TRANSACTIONS, txs, this);
		}) as EventListener);
	}
}
