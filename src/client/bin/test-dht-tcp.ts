// src/client/bin/test-dht-tcp.ts
// DHT discovery + ECIES-encrypted TCP connections

import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { genPrivateKey, pk2id } from "../../devp2p/index.ts";
import { KademliaNode, type PeerInfo } from "../../kademlia/index.ts";
import { EcciesEncrypter } from "../../p2p/connection-encrypters/eccies/eccies-encrypter.ts";
import type { MuxedConnection } from "../../p2p/connection/connection.ts";
import type { ProtocolStream } from "../../p2p/connection/protocol-stream.ts";
import { TransportListener } from "../../p2p/transport/transport-listener.ts";
import { Transport } from "../../p2p/transport/transport.ts";
import { bytesToUnprefixedHex } from "../../utils/index.ts";

debug.enable("p2p:*,kad:*");

// ============ Configuration ============

const NUM_NODES = 2;
const BASE_UDP_PORT = 30300; // DHT discovery (UDP)
const BASE_TCP_PORT = 30400; // ECIES connections (TCP)

// ============ Node Structure ============

interface DHTTCPNode {
  index: number;
  privateKey: Uint8Array;
  peerId: Uint8Array;
  udpPort: number;
  tcpPort: number;
  
  // DHT layer
  kademlia: KademliaNode;
  
  // TCP layer
  transport: Transport;
  listener: TransportListener;
  connections: Map<string, MuxedConnection>;
  protocolHandlers: Map<string, (stream: ProtocolStream) => void>;
}

// ============ Logging ============

function shortId(id: Uint8Array | undefined): string {
  if (!id) return "???";
  return bytesToUnprefixedHex(id).slice(0, 8);
}

function log(nodeIndex: number, message: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  console.log(`[${timestamp}] [Node-${nodeIndex}] ${message}`);
}

// ============ Create a DHT+TCP Node ============

function createDHTTCPNode(nodeIndex: number, udpPort: number, tcpPort: number): DHTTCPNode {
  const privateKey = genPrivateKey();
  const peerId = pk2id(secp256k1.getPublicKey(privateKey, false));

  // ========== DHT Layer ==========
  const kademlia = new KademliaNode(privateKey, {
    endpoint: {
      address: "127.0.0.1",
      udpPort: udpPort,
      tcpPort: tcpPort, // Include TCP port so peers know where to connect
    },
    shouldFindNeighbours: true,
    timeout: 5000,
    refreshInterval: 30000,
    k: 16,
  });

  // ========== TCP Layer ==========
  
  // Create ECIES encrypter for this node
  const encrypter = new EcciesEncrypter(privateKey, {
    requireEip8: true,
    id: peerId,
    remoteId: null, // Will be set per-connection
  });

  // Transport for outbound connections
  const transport = new Transport(
    {
      timeoutMs: 30000,
      maxActiveDials: 10,
    },
    encrypter,
  );

  // Storage
  const connections = new Map<string, MuxedConnection>();
  const protocolHandlers = new Map<string, (stream: ProtocolStream) => void>();

  // Frame handler (for debugging)
  const handleFrame = async (conn: MuxedConnection, frame: unknown): Promise<void> => {
    log(nodeIndex, `📦 Frame received: ${JSON.stringify(frame)}`);
  };

  // Stream open handler (incoming protocol streams)
  const handleStreamOpen = (protocolId: string, stream: ProtocolStream) => {
    const handler = protocolHandlers.get(protocolId);
    if (handler) {
      handler(stream);
    } else {
      log(nodeIndex, `⚠️  No handler for protocol ${protocolId}, closing stream`);
      stream.close();
    }
  };

  // Listener for inbound connections
  const listener = new TransportListener({
    upgrader: encrypter,
    frameHandler: handleFrame,
    streamOpenHandler: (protocolId, stream) => {
        handleStreamOpen(protocolId, stream);
    },
  });

  return {
    index: nodeIndex,
    privateKey,
    peerId,
    udpPort,
    tcpPort,
    kademlia,
    transport,
    listener,
    connections,
    protocolHandlers,
  };
}

// ============ Setup DHT Event Handlers ============

function setupDHTEventHandlers(node: DHTTCPNode, allNodes: DHTTCPNode[]) {
  const { kademlia, index } = node;

  kademlia.events.on("listening", () => {
    log(index, `🔊 DHT listening on UDP:${node.udpPort} | ID: ${shortId(node.peerId)}`);
  });

  kademlia.events.on("peer:new", async (peer: PeerInfo) => {
    log(index, `🆕 DHT PEER:NEW - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
    
    // When we discover a new peer via DHT, try to establish TCP connection
    if (peer.tcpPort && peer.address && peer.id) {
      await attemptTCPConnection(node, peer);
    }
  });

  kademlia.events.on("peer:added", (peer: PeerInfo) => {
    log(index, `✅ DHT PEER:ADDED - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
  });

  kademlia.events.on("peer:removed", (peer: PeerInfo) => {
    log(index, `❌ DHT PEER:REMOVED - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
  });

  kademlia.events.on("error", (err: Error) => {
    log(index, `⚠️  DHT ERROR: ${err.message}`);
  });
}

// ============ TCP Connection Logic ============

async function attemptTCPConnection(node: DHTTCPNode, peer: PeerInfo): Promise<void> {
  const connKey = `${peer.address}:${peer.tcpPort}`;
  
  // Skip if already connected
  if (node.connections.has(connKey)) {
    log(node.index, `⏭️  Already connected to ${connKey}`);
    return;
  }

  log(node.index, `🔌 Attempting ECIES TCP connection to ${peer.address}:${peer.tcpPort}...`);

  try {
    // Build multiaddr for the peer's TCP endpoint
    const peerMultiaddr = multiaddr(`/ip4/${peer.address}/tcp/${peer.tcpPort}`);
    
    // Dial the peer with their peer ID for ECIES encryption
    const [error, connection] = await node.transport.dial(peerMultiaddr, peer.id);
    
    if (error) {
      log(node.index, `❌ TCP connection failed: ${error.message}`);
      return;
    }

    // Store the connection
    node.connections.set(connKey, connection);
    log(node.index, `✅ TCP connection established to ${connKey}`);

    // Set up connection event handlers
    connection.setOnFrame((frame) => {
      log(node.index, `📦 Frame from ${connKey}: ${JSON.stringify(frame)}`);
    });

    connection.setOnStreamOpen((protocolId, stream) => {
      log(node.index, `📨 Incoming stream from ${connKey} for protocol: ${protocolId}`);
      const handler = node.protocolHandlers.get(protocolId);
      if (handler) {
        handler(stream);
      } else {
        stream.close();
      }
    });

    // Optionally: Open a ping stream to test the connection
    await testPingProtocol(node, connection, connKey);

  } catch (err: any) {
    log(node.index, `❌ TCP connection error: ${err.message}`);
  }
}

// ============ Simple Ping Protocol ============

const PING_PROTOCOL = "/ping/1.0.0";

function setupPingProtocol(node: DHTTCPNode) {
  node.protocolHandlers.set(PING_PROTOCOL, (stream: ProtocolStream) => {
    log(node.index, `🏓 Ping stream opened (responding)`);

    stream.addEventListener("message", (evt: any) => {
      const msg = evt.data;
      log(node.index, `🏓 Received: ${JSON.stringify(msg)}`);
      
      if (msg?.type === "ping") {
        // Respond with pong
        stream.send({ type: "pong", ts: msg.ts, from: shortId(node.peerId) });
      }
    });

    stream.addEventListener("remoteCloseWrite", () => {
      stream.close();
    });
  });
}

async function testPingProtocol(node: DHTTCPNode, connection: MuxedConnection, connKey: string) {
  try {
    log(node.index, `🏓 Opening ping stream to ${connKey}...`);
    const stream = connection.openStream(PING_PROTOCOL);

    // Send a ping
    const pingTs = Date.now();
    stream.send({ type: "ping", ts: pingTs, from: shortId(node.peerId) });
    log(node.index, `🏓 Sent ping to ${connKey}`);

    // Listen for pong
    stream.addEventListener("message", (evt: any) => {
      const msg = evt.data;
      if (msg?.type === "pong") {
        const rtt = Date.now() - msg.ts;
        log(node.index, `🏓 Received pong from ${connKey} (RTT: ${rtt}ms)`);
      }
    });

    // Close stream after a short delay
    // setTimeout(() => stream.close(), 2000);
  } catch (err: any) {
    log(node.index, `❌ Ping protocol error: ${err.message}`);
  }
}

// ============ Main ============

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       DHT Discovery + ECIES TCP Connection Test           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const nodes: DHTTCPNode[] = [];

  // Step 1: Create all nodes
  console.log("📦 Creating nodes...\n");
  for (let i = 0; i < NUM_NODES; i++) {
    const udpPort = BASE_UDP_PORT + i;
    const tcpPort = BASE_TCP_PORT + i;
    const node = createDHTTCPNode(i, udpPort, tcpPort);
    nodes.push(node);
    
    // Setup protocol handlers
    setupPingProtocol(node);
  }

  // Step 2: Setup DHT event handlers (needs all nodes for reference)
  for (const node of nodes) {
    setupDHTEventHandlers(node, nodes);
  }

  // Step 3: Start TCP listeners
  console.log("\n🔌 Starting TCP listeners...\n");
  for (const node of nodes) {
    const listenAddr = multiaddr(`/ip4/127.0.0.1/tcp/${node.tcpPort}`);
    await node.listener.listen(listenAddr);
    log(node.index, `🔊 TCP listening on port ${node.tcpPort}`);
  }

  // Step 4: Bind DHT (UDP) sockets
  console.log("\n🔌 Binding DHT (UDP) sockets...\n");
  for (const node of nodes) {
    node.kademlia.bind(node.udpPort);
  }

  await sleep(1000);

  // Step 5: Bootstrap DHT nodes
  console.log("\n🔗 Bootstrapping DHT network...\n");
  for (let i = 1; i < nodes.length; i++) {
    const bootstrapPeer: PeerInfo = {
      address: "127.0.0.1",
      udpPort: nodes[i - 1].udpPort,
      tcpPort: nodes[i - 1].tcpPort,
      id: nodes[i - 1].peerId
    };
    
    log(i, `Bootstrapping to Node-${i - 1}...`);
    try {
      await nodes[i].kademlia.bootstrap(bootstrapPeer);
      log(i, `Bootstrap successful!`);
    } catch (err: any) {
      log(i, `Bootstrap failed: ${err.message}`);
    }
    
    await sleep(500);
  }

  // Step 6: Wait for discovery and connections
  console.log("\n⏳ Waiting for peer discovery and TCP connections (15 seconds)...\n");
  await sleep(15000);

  // Step 7: Print final state
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                    Final Network State                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  for (const node of nodes) {
    const dhtPeers = node.kademlia.getPeers();
    const tcpConns = node.connections.size;
    log(node.index, `📊 DHT peers: ${dhtPeers.length} | TCP connections: ${tcpConns}`);
    
    for (const [connKey, _conn] of node.connections) {
      log(node.index, `   └─ TCP: ${connKey}`);
    }
  }

  // Step 8: Monitoring mode
  console.log("\n🔄 Entering monitoring mode (Ctrl+C to exit)...\n");

  process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down...");
    
    for (const node of nodes) {
      log(node.index, "Closing connections...");
      for (const conn of node.connections.values()) {
        try {
          conn.onClose();
        } catch {}
      }
      node.kademlia.destroy();
    }
    
    console.log("✅ All nodes destroyed. Goodbye!");
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);