// src/devp2p/dpt/index.ts
// DPT (Discovery Protocol) exports

// Re-export Kademlia types for backward compatibility
export {
	BanList,
	KademliaNode,
	type Contact,
	type KademliaConfig,
	type KademliaEvent,
	type PeerInfo,
} from "../../kademlia/index.ts";
export * from "./dpt.ts";
