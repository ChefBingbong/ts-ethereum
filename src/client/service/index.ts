/**
 * @module service
 */

export * from "./p2p-fullethereumservice.ts";
export * from "./fullethereumservice-types.ts";
export * from "./service.ts";

// Re-export P2PFullEthereumService as FullEthereumService for backward compatibility
export { P2PFullEthereumService as FullEthereumService } from "./p2p-fullethereumservice.ts";
