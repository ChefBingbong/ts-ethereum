import type { Multiaddr } from "@multiformats/multiaddr";
import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import type { PeerInfo as DPTPeerInfo } from "../devp2p/dpt-1/index.ts";
import { ETH } from "../devp2p/protocol/eth.ts";
import { dptDiscovery } from "../p2p/libp2p/discovery/index.ts";
import { P2PNode, type P2PNode as P2PNodeType } from "../p2p/libp2p/node.ts";
import type { ComponentLogger } from "../p2p/libp2p/types.ts";
import { rlpx } from "../p2p/transport/rlpx/index.ts";
import { unprefixedHexToBytes } from "../utils/index.ts";
import { Config, type ConfigOptions, SyncMode } from "./config.ts";
import { isBrowser } from "./util";

const log = debug("p2p:config");

export interface P2PConfigOptions extends ConfigOptions {
	/**
	 * Optional P2PNode instance (for testing)
	 * If provided, will be used instead of creating a new one
	 */
	node?: P2PNode;
}

/**
 * P2P Config - Extends Config to use P2PNode instead of RlpxServer
 *
 * Creates a P2PNode with RLPx transport and DPT discovery,
 * providing the same interface as Config but using the new
 * libp2p-style networking stack.
 *
 * @memberof module:client
 */
export class P2PConfig extends Config {
	public readonly node: P2PNodeType | undefined = undefined;

	constructor(options: P2PConfigOptions = {}) {
		log("Creating P2PConfig");
		super(options);

		// Override server creation with P2PNode
		if (this.syncmode !== SyncMode.None) {
			if (options.node !== undefined) {
				log("Using provided P2PNode instance");
				// Use provided node (for testing)
				(this as any).node = options.node;
				// Register ETH protocol handler even when node is provided
				this.registerEthProtocol(options.node);
			} else if (isBrowser() !== true) {
				log("Creating new P2PNode");
				// Create P2PNode
				(this as any).node = this.createP2PNode(options);
			}
		}
		log("P2PConfig created");
	}

	/**
	 * Register ETH protocol handler with P2PNode
	 */
	private registerEthProtocol(node: P2PNodeType): void {
		log("Registering ETH protocol handler with P2PNode");
		// Register ETH protocol handler with P2PNode for discovery/routing
		// Note: This is for protocol discovery only - messages go through RLPxConnection socket
		node.handle("/eth/68/1.0.0", () => {
			// Dummy handler - actual message handling is done through RLPxConnection
			// This registration allows P2PNode to advertise ETH protocol support
		});
	}

	/**
	 * Create P2PNode instance
	 * Note: P2PNode constructor is synchronous
	 */
	private createP2PNode(_options: P2PConfigOptions): P2PNodeType {
		log("Creating P2PNode with port %d, maxPeers %d", this.port, this.maxPeers);
		// Create ETH capabilities
		const capabilities = [ETH.eth68];

		// Convert bootnodes from Multiaddr to DPT PeerInfo format
		const dptBootnodes = this.convertBootnodesToDPT(
			this.bootnodes ?? (this.chainCommon.bootstrapNodes() as any),
		);
		log("Converted %d bootnodes to DPT format", dptBootnodes.length);

		// Create component logger from config logger
		const componentLogger = this.createComponentLogger();

		// Create P2PNode synchronously
		log("Instantiating P2PNode");
		const node = new P2PNode({
			privateKey: this.key,
			addresses: {
				listen: [
					this.extIP
						? `/ip4/${this.extIP}/tcp/${this.port}`
						: `/ip4/0.0.0.0/tcp/${this.port}`,
				],
			},
			transports: [
				(components) =>
					rlpx({
						privateKey: this.key,
						capabilities,
						common: this.chainCommon,
						timeout: 10000,
						maxConnections: this.maxPeers,
					})({
						logger: components.logger,
					}) as any, // Type assertion needed for transport compatibility
			],
			peerDiscovery: this.discV4
				? [
						(components) =>
							dptDiscovery({
								privateKey: this.key,
								bindAddr: this.extIP ?? "127.0.0.1",
								bindPort: this.port,
								bootstrapNodes: dptBootnodes,
								autoDial: true,
								autoDialBootstrap: true,
							})(components),
					]
				: [],
			maxConnections: this.maxPeers,
			logger: componentLogger as any, // Type assertion for logger compatibility
		});

		// Register ETH protocol handler
		this.registerEthProtocol(node);

		log("P2PNode created successfully");
		return node;
	}

	/**
	 * Convert Multiaddr bootnodes to DPT PeerInfo format
	 */
	private convertBootnodesToDPT(
		bootnodes: Multiaddr[] | string[] | string,
	): DPTPeerInfo[] {
		const result: DPTPeerInfo[] = [];

		// Normalize to array
		const bootnodeArray: Multiaddr[] = [];
		if (typeof bootnodes === "string") {
			bootnodeArray.push(multiaddr(bootnodes));
		} else if (Array.isArray(bootnodes)) {
			for (const bn of bootnodes) {
				if (typeof bn === "string") {
					bootnodeArray.push(multiaddr(bn));
				} else {
					bootnodeArray.push(bn);
				}
			}
		}

		// Convert each bootnode
		for (const ma of bootnodeArray) {
			try {
				const peerInfo = this.multiaddrToDPTPeerInfo(ma);
				if (peerInfo) {
					result.push(peerInfo);
				}
			} catch (err) {
				this.logger?.warn(
					`Failed to convert bootnode ${ma.toString()}: ${err}`,
				);
			}
		}

		return result;
	}

	/**
	 * Convert a Multiaddr to DPT PeerInfo format
	 */
	private multiaddrToDPTPeerInfo(ma: Multiaddr): DPTPeerInfo | null {
		// Extract node ID from multiaddr
		// Format: /ip4/127.0.0.1/tcp/30303/p2p/<peer-id>
		// Or: /ip4/127.0.0.1/tcp/30303 (no peer ID)
		// Or: enode://<node-id>@<ip>:<port>

		const maString = ma.toString();
		let address: string | undefined;
		let tcpPort: number | undefined;
		let udpPort: number | undefined;
		let nodeId: Uint8Array | undefined;

		// Check for enode format first: enode://<node-id>@<ip>:<port>
		const enodeMatch = maString.match(/enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)/);
		if (enodeMatch) {
			const [, nodeIdHex, ip, port] = enodeMatch;
			try {
				nodeId = unprefixedHexToBytes(nodeIdHex);
				address = ip;
				tcpPort = parseInt(port, 10);
				udpPort = parseInt(port, 10);
			} catch {
				// Ignore conversion errors
			}
		} else {
			// Parse multiaddr format: /ip4/127.0.0.1/tcp/30303[/p2p/...]
			const parts = maString.split("/");
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const nextPart = parts[i + 1];

				if (part === "ip4" && nextPart) {
					address = nextPart;
				} else if (part === "ip6" && nextPart) {
					address = nextPart;
				} else if (part === "tcp" && nextPart) {
					tcpPort = parseInt(nextPart, 10);
				} else if (part === "udp" && nextPart) {
					udpPort = parseInt(nextPart, 10);
				} else if (part === "p2p" && nextPart) {
					// Try to extract node ID from p2p protocol
					try {
						// P2P protocol uses base58 or hex encoding
						// For DPT, we need 64-byte node ID (secp256k1 public key)
						// This is a simplified conversion - may need adjustment
						const peerIdBytes = Buffer.from(nextPart, "hex");
						if (peerIdBytes.length === 64) {
							nodeId = new Uint8Array(peerIdBytes);
						}
					} catch {
						// Ignore conversion errors
					}
				}
			}
		}

		if (!address || !tcpPort) {
			return null;
		}

		return {
			id: nodeId || new Uint8Array(64), // DPT will generate if missing
			address,
			tcpPort,
			udpPort: udpPort || tcpPort,
		};
	}

	/**
	 * Create ComponentLogger from Config logger
	 */
	private createComponentLogger(): ComponentLogger {
		// Create a simple component logger adapter
		// The P2PNode expects ComponentLogger, but Config has Logger
		return {
			forComponent: (component: string) => {
				// Return a logger that wraps the config logger
				const log = (formatter: string, ...args: any[]) => {
					this.logger?.info(`[${component}] ${formatter}`, ...args);
				};
				log.enabled = true;
				log.trace = (formatter: string, ...args: any[]) => {
					this.logger?.debug(`[${component}] ${formatter}`, ...args);
				};
				log.error = (formatter: string, ...args: any[]) => {
					this.logger?.error(`[${component}] ${formatter}`, ...args);
				};
				log.newScope = (name: string) =>
					this.createComponentLogger().forComponent(`${component}:${name}`);
				return log as any;
			},
		};
	}
}
