// src/client/bin/test-dht.ts
// Simple DHT-only network test - no ETH protocol, just discovery

import { randomBytes } from "crypto";
import {
    KademliaNode,
    type PeerInfo,
} from "../../kademlia/index.ts";
import { bytesToUnprefixedHex } from "../../utils/index.ts";

// ============ Configuration ============

const NUM_NODES = 5;
const BASE_PORT = 30300;

interface DHTNode {
  kademlia: KademliaNode;
  privateKey: Uint8Array;
  port: number;
}

// ============ Logging Helpers ============

function shortId(id: Uint8Array | undefined): string {
  if (!id) return "???";
  return bytesToUnprefixedHex(id).slice(0, 8);
}

function log(nodeIndex: number, message: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  console.log(`[${timestamp}] [Node-${nodeIndex}] ${message}`);
}

// ============ Create a DHT Node ============

function createDHTNode(nodeIndex: number, port: number): DHTNode {
  const privateKey = randomBytes(32);
  
  const kademlia = new KademliaNode(privateKey, {
    endpoint: {
      address: "127.0.0.1",
      udpPort: port,
      tcpPort: port, // We're not using TCP for DHT-only
    },
    shouldFindNeighbours: true,
    timeout: 5000,
    refreshInterval: 30000, // 30 seconds
    k: 16, // k-bucket size
  });

  // ============ Event Handlers ============

  kademlia.events.on("listening", () => {
    log(nodeIndex, `Listening on UDP port ${port} | ID: ${shortId(kademlia.id)}`);
  });

  kademlia.events.on("peer:new", (peer: PeerInfo) => {
    log(nodeIndex, `🆕 PEER:NEW - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
  });

  kademlia.events.on("peer:added", (peer: PeerInfo) => {
    log(nodeIndex, `✅ PEER:ADDED to routing table - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
    printRoutingTableSummary(nodeIndex, kademlia);
  });

  kademlia.events.on("peer:removed", (peer: PeerInfo) => {
    log(nodeIndex, `❌ PEER:REMOVED from routing table - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
  });

  kademlia.events.on("error", (err: Error) => {
    log(nodeIndex, `⚠️  ERROR: ${err.message}`);
  });

  kademlia.events.on("close", () => {
    log(nodeIndex, "DHT node closed");
  });

  return { kademlia, privateKey, port };
}

// ============ Routing Table Summary ============

function printRoutingTableSummary(nodeIndex: number, kademlia: KademliaNode) {
  const peers = kademlia.getPeers();
  const summary = kademlia.getBucketSplitSummary();
  
  log(nodeIndex, `📊 Routing Table: ${peers.length} peers across ${summary.totalBuckets} buckets (max depth: ${summary.maxDepth})`);
  
  if (summary.bucketsByDepth.length > 0) {
    const depthInfo = summary.bucketsByDepth
      .map(d => `depth ${d.depth}: ${d.count} buckets (${d.totalPeers} peers)`)
      .join(", ");
    log(nodeIndex, `   └─ ${depthInfo}`);
  }
}

// ============ Detailed Peer List ============

function printPeerList(nodeIndex: number, kademlia: KademliaNode) {
  const peers = kademlia.getPeers();
  log(nodeIndex, `📋 Peer List (${peers.length} total):`);
  
  for (const peer of peers) {
    log(nodeIndex, `   └─ ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
  }
}

// ============ Main ============

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║         Simple DHT Network Test                   ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  const nodes: DHTNode[] = [];

  // Step 1: Create all nodes
  console.log("📦 Creating DHT nodes...\n");
  for (let i = 0; i < NUM_NODES; i++) {
    const port = BASE_PORT + i;
    const node = createDHTNode(i, port);
    nodes.push(node);
  }

  // Step 2: Bind all nodes (start listening)
  console.log("\n🔌 Binding nodes to ports...\n");
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].kademlia.bind(nodes[i].port);
  }

  // Wait for sockets to be ready
  await sleep(1000);

  // Step 3: Bootstrap nodes in a chain (node 1 -> node 0, node 2 -> node 1, etc.)
  console.log("\n🔗 Bootstrapping nodes...\n");
  
  // Each node bootstraps to the previous node, creating a chain
  for (let i = 1; i < nodes.length; i++) {
    const bootstrapPeer: PeerInfo = {
      address: "127.0.0.1",
      udpPort: nodes[i - 1].port,
      tcpPort: nodes[i - 1].port,
    };
    
    log(i, `Bootstrapping to Node-${i - 1} (port ${bootstrapPeer.udpPort})...`);
    
    try {
      await nodes[i].kademlia.bootstrap(bootstrapPeer);
      log(i, `Bootstrap successful!`);
    } catch (err: any) {
      log(i, `Bootstrap failed: ${err.message}`);
    }
    
    // Small delay between bootstraps
    await sleep(500);
  }

  // Step 4: Let the network settle and discover peers
  console.log("\n⏳ Waiting for peer discovery (10 seconds)...\n");
  await sleep(10000);

  // Step 5: Print final state
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║              Final Network State                  ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  for (let i = 0; i < nodes.length; i++) {
    printPeerList(i, nodes[i].kademlia);
    console.log("");
  }

  // Step 6: Interactive mode - keep running and show periodic updates
  console.log("🔄 Entering monitoring mode (Ctrl+C to exit)...\n");
  
  const monitorInterval = setInterval(() => {
    console.log("\n--- Periodic Status Update ---");
    for (let i = 0; i < nodes.length; i++) {
      const peers = nodes[i].kademlia.getPeers();
      log(i, `Peers: ${peers.length}`);
    }
    console.log("");
  }, 15000);

  // Cleanup on exit
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down...");
    clearInterval(monitorInterval);
    
    for (let i = 0; i < nodes.length; i++) {
      log(i, "Destroying node...");
      nodes[i].kademlia.destroy();
    }
    
    console.log("✅ All nodes destroyed. Goodbye!");
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(console.error);