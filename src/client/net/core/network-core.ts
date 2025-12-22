import type { Connection, P2PNode, PeerId } from "../../../p2p/libp2p/types.ts";
import { peerIdToString } from "../../../p2p/libp2p/types.ts";
import type { RLPxConnection } from "../../../p2p/transport/rlpx/connection.ts";
import { bigIntToUnpaddedBytes } from "../../../utils/index.ts";
import type { Chain } from "../../blockchain/chain.ts";
import type { Config } from "../../config/index.ts";
import type { VMExecution } from "../../execution";
import { Event } from "../../types.ts";
import { P2PPeer } from "../peer/p2p-peer.ts";
import type { Peer } from "../peer/peer.ts";
import type { ETH, EthStatusOpts } from "../protocol/eth/eth.ts";
import { PeerConnectionHandler } from "./peer-connection-handler.ts";
import type { NetworkCoreOptions } from "./types.ts";

export class NetworkCore {
	public readonly config: Config;
	private readonly node: P2PNode;
	public readonly chain?: Chain;
	public readonly execution: VMExecution;

	public readonly peers: Map<string, Peer> = new Map();
	public readonly pendingPeers: Map<string, P2PPeer> = new Map();
	private noPeerPeriods: number = 0;
	private opened: boolean = false;
	public running: boolean = false;

	private readonly DEFAULT_STATUS_CHECK_INTERVAL = 20000;
	private readonly DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL = 5000;

	private statusCheckInterval: NodeJS.Timeout | undefined;
	private peerBestHeaderUpdateInterval: NodeJS.Timeout | undefined;
	private reconnectTimeout: NodeJS.Timeout | undefined;

	static async init(options: NetworkCoreOptions): Promise<NetworkCore> {
		const core = new NetworkCore(options);

		core.node.addEventListener(
			"connection:open",
			core.onConnectionOpen.bind(core),
		);
		core.node.addEventListener(
			"connection:close",
			core.onConnectionClose.bind(core),
		);
		core.node.addEventListener(
			"peer:disconnect",
			core.onPeerDisconnect.bind(core),
		);

		core.config.events.on(Event.PEER_CONNECTED, (peer) => core.connected(peer));
		core.config.events.on(Event.PEER_DISCONNECTED, (peer) =>
			core.disconnected(peer),
		);
		core.config.events.on(Event.PEER_ERROR, (error, peer) => {
			if (core.peers.get(peer.id)) {
				core.banPeer(peer);
			}
		});

		core.opened = true;

		core.statusCheckInterval = setInterval(
			() => core.statusCheck(),
			core.DEFAULT_STATUS_CHECK_INTERVAL,
		);
		core.peerBestHeaderUpdateInterval = setInterval(
			() => core.peerBestHeaderUpdate(),
			core.DEFAULT_PEER_BEST_HEADER_UPDATE_INTERVAL,
		);
		core.running = true;

		await options.chain.open();
		return core;
	}

	constructor(options: NetworkCoreOptions) {
		this.config = options.config;
		this.node = options.node;
		this.chain = options.chain;
		this.execution = options.execution;
	}

	async stop(): Promise<boolean> {
		if (this.opened) {
			await this.close();
		}
		clearInterval(this.statusCheckInterval as NodeJS.Timeout);
		clearInterval(this.peerBestHeaderUpdateInterval as NodeJS.Timeout);
		clearTimeout(this.reconnectTimeout as NodeJS.Timeout);
		this.running = false;
		return true;
	}

	async close(): Promise<void> {
		this.node.removeEventListener(
			"connection:open",
			this.onConnectionOpen.bind(this),
		);
		this.node.removeEventListener(
			"connection:close",
			this.onConnectionClose.bind(this),
		);
		this.node.removeEventListener(
			"peer:disconnect",
			this.onPeerDisconnect.bind(this),
		);

		await this.node.stop();
		this.config.events.removeAllListeners(Event.PEER_CONNECTED);
		this.config.events.removeAllListeners(Event.PEER_DISCONNECTED);
		this.config.events.removeAllListeners(Event.PEER_ERROR);

		this.peers.clear();
		this.pendingPeers.clear();
		this.opened = false;
	}

	getConnectedPeers(): Peer[] {
		return Array.from(this.peers.values());
	}

	getPeerCount(): number {
		return this.peers.size;
	}

	containsPeer(peer: Peer | string): boolean {
		const peerId = typeof peer !== "string" ? peer.id : peer;
		return !!this.peers.get(peerId);
	}

	getIdlePeer(filterFn = (_peer: Peer) => true): Peer | undefined {
		const idle = this.getConnectedPeers().filter((p) => p.idle && filterFn(p));
		if (idle.length > 0) {
			const index = Math.floor(Math.random() * idle.length);
			return idle[index];
		}
		return;
	}

	addPeer(peer?: Peer): void {
		if (peer?.id !== undefined && !this.peers.get(peer.id)) {
			this.peers.set(peer.id, peer);
			peer.pooled = true;
			this.config.events.emit(Event.POOL_PEER_ADDED, peer);
		}
	}

	removePeer(peer?: Peer): void {
		if (peer && peer.id) {
			if (this.peers.delete(peer.id)) {
				peer.pooled = false;
				this.config.events.emit(Event.POOL_PEER_REMOVED, peer);
			}
			this.pendingPeers.delete(peer.id);
		}
	}

	banPeer(peer: Peer, maxAge: number = 60000): void {
		if (peer instanceof P2PPeer) {
			this.node.hangUp(peer.connection.remotePeer).catch(() => {});
		}
		this.removePeer(peer);
		this.config.events.emit(Event.POOL_PEER_BANNED, peer);

		this.reconnectTimeout = setTimeout(async () => {
			if (this.running && this.getPeerCount() === 0) {
				this.config.options.logger?.info(
					"Pool empty after ban period - waiting for discovery",
				);
			}
		}, maxAge + 1000);
	}

	private connected(peer: Peer): void {
		if (this.getPeerCount() >= this.config.options.maxPeers) {
			return;
		}
		this.addPeer(peer);
		peer.handleMessageQueue();
	}

	private disconnected(peer: Peer): void {
		this.removePeer(peer);
	}

	private onConnectionOpen(evt: CustomEvent<Connection>): void {
		const connection = evt.detail;
		const peerIdHex = peerIdToString(connection.remotePeer);

		if (connection.status !== "open") {
			return;
		}

		const connectionWrapper = connection as Connection & {
			getRLPxConnection?: () => RLPxConnection;
		};
		const rlpxConnection = connectionWrapper.getRLPxConnection?.();

		if (!rlpxConnection) {
			return;
		}

		new PeerConnectionHandler(this, connection, rlpxConnection)
			.handle()
			.catch(() => {});
	}

	public async sendStatusToPeer(
		peer: P2PPeer,
		rlpxConnection: RLPxConnection,
		peerIdHex: string,
	): Promise<void> {
		if (!this.chain || !peer.eth) {
			return;
		}

		const protocols = rlpxConnection.getProtocols();
		const ethProtocol = protocols.find((p) => p.constructor.name === "ETH") as
			| ETH
			| undefined;

		if (!ethProtocol) {
			return;
		}

		try {
			const genesisHash = this.chain.blockchain.genesisBlock.hash();
			const bestHash = this.chain.headers.latest
				? this.chain.headers.latest.hash()
				: genesisHash;
			const td = this.chain.headers.td;

			const statusOpts: EthStatusOpts = {
				td: bigIntToUnpaddedBytes(td),
				bestHash,
				genesisHash,
			};

			ethProtocol.sendStatus(statusOpts);
		} catch (err: unknown) {
			this.pendingPeers.delete(peerIdHex);
		}
	}

	public async waitForPeerStatus(
		peer: P2PPeer,
		peerIdHex: string,
	): Promise<void> {
		if (!peer.eth) {
			this.pendingPeers.delete(peerIdHex);
			this.addPeer(peer);
			this.config.events.emit(Event.PEER_CONNECTED, peer);
			return;
		}

		const ethHandler = peer.eth as any;

		if ((ethHandler as any)._statusExchanged === true) {
			if (this.pendingPeers.has(peerIdHex)) {
				this.pendingPeers.delete(peerIdHex);
				this.addPeer(peer);
				this.config.events.emit(Event.PEER_CONNECTED, peer);
			}
			return;
		}

		const abortController = new AbortController();
		let statusTimeout: NodeJS.Timeout | undefined;
		let listenerAttached = false;

		const cleanup = () => {
			if (statusTimeout !== undefined) {
				clearTimeout(statusTimeout);
				statusTimeout = undefined;
			}
			if (listenerAttached) {
				ethHandler.off("status", onStatusReceived);
				listenerAttached = false;
			}
		};

		const onStatusReceived = () => {
			if (abortController.signal.aborted) {
				return;
			}

			abortController.abort();
			cleanup();

			if (this.pendingPeers.has(peerIdHex)) {
				this.pendingPeers.delete(peerIdHex);
				this.addPeer(peer);
				this.config.events.emit(Event.PEER_CONNECTED, peer);
			}
		};

		statusTimeout = setTimeout(() => {
			if (abortController.signal.aborted) {
				return;
			}

			abortController.abort();
			cleanup();

			if (this.pendingPeers.has(peerIdHex)) {
				this.pendingPeers.delete(peerIdHex);
				this.addPeer(peer);
				this.config.events.emit(Event.PEER_CONNECTED, peer);
			}
		}, 10000);

		abortController.signal.addEventListener("abort", () => {
			cleanup();
		});

		listenerAttached = true;
		ethHandler.once("status", onStatusReceived);
	}

	private onConnectionClose(evt: CustomEvent<Connection>): void {
		try {
			const connection = evt.detail;
			const peerIdHex = peerIdToString(connection.remotePeer);
			const peer =
				this.peers.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
			if (peer) {
				this.removePeer(peer);
				this.config.events.emit(Event.PEER_DISCONNECTED, peer);
			}
		} catch (error) {}
	}

	private onPeerDisconnect(evt: CustomEvent<PeerId>): void {
		try {
			const peerId = evt.detail;
			const peerIdHex = peerIdToString(peerId);
			const peer =
				this.peers.get(peerIdHex) || this.pendingPeers.get(peerIdHex);
			if (peer) {
				this.removePeer(peer);
				this.config.events.emit(Event.PEER_DISCONNECTED, peer);
			}
		} catch (error) {}
	}

	private async statusCheck(): Promise<void> {
		try {
			const NO_PEER_PERIOD_COUNT = 3;
			if (this.getPeerCount() === 0 && this.config.options.maxPeers > 0) {
				this.noPeerPeriods += 1;
				if (this.noPeerPeriods >= NO_PEER_PERIOD_COUNT) {
					this.noPeerPeriods = 0;
					this.config.options.logger?.info(
						"No peers in pool - waiting for peer discovery",
					);
				}
			} else {
				this.noPeerPeriods = 0;
			}
		} catch (error) {}
	}

	private async peerBestHeaderUpdate(): Promise<void> {
		for (const p of this.getConnectedPeers()) {
			if (p.idle && p.eth !== undefined && p instanceof P2PPeer) {
				try {
					p.idle = false;
					await p.latest();
					p.idle = true;
				} catch (error) {
					p.idle = true;
				}
			}
		}
	}
}
