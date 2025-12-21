import debug from "debug";
import type { Connection } from "../../../p2p/libp2p/types.ts";
import { peerIdToString } from "../../../p2p/libp2p/types.ts";
import { EthHandler } from "../../../p2p/protocol/eth/handler.ts";
import type { RLPxConnection } from "../../../p2p/transport/rlpx/index.ts";
import type { Chain } from "../../blockchain";
import type { VMExecution } from "../../execution";
import { Event } from "../../types.ts";
import type { PeerOptions } from "./peer.ts";
import { Peer } from "./peer.ts";

const log = debug("p2p:peer");

export interface P2PPeerOptions
	extends Omit<PeerOptions, "address" | "transport"> {
	/* P2P Connection from P2PNode */
	connection: Connection;

	/* RLPx Connection (extracted from connection) */
	rlpxConnection: RLPxConnection;

	/* Pass true if peer initiated connection (default: false) */
	inbound?: boolean;

	/* Chain instance (for ETH handler) */
	chain?: Chain;

	/* VMExecution instance (for ETH handler) */
	execution?: VMExecution;
}

/**
 * P2P Peer - Wraps a libp2p-style Connection + RLPxConnection
 * to provide the same interface as RlpxPeer for compatibility
 * with existing synchronizer/txpool code
 *
 * @memberof module:net/peer
 */
export class P2PPeer extends Peer {
	public readonly connection: Connection;
	public readonly rlpxConnection: RLPxConnection;
	private readonly chain?: Chain;
	private readonly execution?: VMExecution;

	/**
	 * Create new P2P peer
	 */
	constructor(options: P2PPeerOptions) {
		// Derive ID from remote peer
		const peerIdHex = peerIdToString(options.connection.remotePeer);

		log("Creating P2PPeer: %s", peerIdHex.slice(0, 8));

		// Derive address from remote address
		const address = options.connection.remoteAddr.toString();

		super({
			config: options.config,
			id: peerIdHex,
			address,
			transport: "p2p",
			inbound: options.inbound ?? options.connection.direction === "inbound",
		});

		this.connection = options.connection;
		this.rlpxConnection = options.rlpxConnection;
		this.chain = options.chain;
		this.execution = options.execution;

		log("Binding protocols for peer %s", peerIdHex.slice(0, 8));
		// Bind protocols immediately (connection is already established)
		this.bindProtocols();

		// Listen for RLPx connection close events
		this.rlpxConnection.once("close", () => {
			log("RLPx connection closed for peer %s", peerIdHex.slice(0, 8));
			this.config.events.emit(Event.PEER_DISCONNECTED, this);
		});

		// Listen for RLPx connection errors
		this.rlpxConnection.on("error", (err: Error) => {
			log(
				"RLPx connection error for peer %s: %s",
				peerIdHex.slice(0, 8),
				err.message,
			);
			this.config.events.emit(Event.PEER_ERROR, err, this);
		});
		log("P2PPeer created: %s", peerIdHex.slice(0, 8));
	}

	/**
	 * Bind protocols from RLPxConnection
	 */
	private bindProtocols(): void {
		const protocols = this.rlpxConnection.getProtocols();
		log(
			"Found %d protocols for peer %s",
			protocols.length,
			this.id.slice(0, 8),
		);

		// Find ETH protocol
		const ethProtocol = protocols.find((p) => p.constructor.name === "ETH");

		if (ethProtocol) {
			log("Binding ETH protocol for peer %s", this.id.slice(0, 8));

			if (this.chain && this.execution) {
				// Use EthHandler directly (it implements EthProtocolMethods)
				log("Creating EthHandler for peer %s", this.id.slice(0, 8));
				const ethHandler = new EthHandler({
					config: this.config,
					chain: this.chain,
					execution: this.execution,
					rlpxConnection: this.rlpxConnection,
				});

				// Forward messages from EthHandler to service via PROTOCOL_MESSAGE event
				ethHandler.on("message", (message: any) => {
					// Emit PROTOCOL_MESSAGE event so service can handle it
					this.config.events.emit(Event.PROTOCOL_MESSAGE, message, "eth", this);
				});

				// Use handler directly (it implements EthProtocolMethods)
				this.eth = ethHandler;
				this.boundProtocols.push(ethHandler);
				log(
					"ETH protocol bound using EthHandler for peer %s",
					this.id.slice(0, 8),
				);
			} else {
				log(
					"Chain or execution not available, skipping ETH handler creation for peer %s",
					this.id.slice(0, 8),
				);
			}
		} else {
			log("No ETH protocol found for peer %s", this.id.slice(0, 8));
		}
	}

	/**
	 * Connect peer (no-op for P2P peers - connection already established)
	 */
	async connect(): Promise<void> {
		log(
			"connect() called for peer %s (already connected)",
			this.id.slice(0, 8),
		);
		// Connection is already established when P2PPeer is created
		// This method exists for interface compatibility
		if (this.connection.status === "open") {
			this.config.events.emit(Event.PEER_CONNECTED, this);
		}
	}

	/**
	 * Disconnect peer
	 */
	async disconnect(): Promise<void> {
		log("Disconnecting peer %s", this.id.slice(0, 8));
		await this.connection.close();
		log("Peer %s disconnected", this.id.slice(0, 8));
	}

	/**
	 * Handle queued messages (compatibility - no-op for P2P)
	 */
	handleMessageQueue(): void {
		// No-op - messages flow through events directly
		// But call parent for compatibility
		super.handleMessageQueue();
	}

	/**
	 * String representation of peer
	 */
	toString(withFullId = false): string {
		const properties = {
			id: withFullId ? this.id : this.id.slice(0, 8),
			address: this.address,
			transport: this.transport,
			protocols: this.boundProtocols.map((e) => e.name),
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
