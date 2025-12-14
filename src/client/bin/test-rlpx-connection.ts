#!/usr/bin/env node

/**
 * Simple RLPx Transport Connection Test
 * 
 * This script tests RLPx transport connections in isolation:
 * - Creates two nodes (listener and dialer)
 * - Sets up RLPx transport on both
 * - Attempts BasicConnection and logs all steps
 */

import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { genPrivateKey, KademliaNode, PeerInfo, pk2id } from "../../devp2p/index.ts";
import { EcciesEncrypter } from "../../p2p/connection-encrypters/eccies/eccies-encrypter.ts";
import type { BasicConnection } from "../../p2p/connection/basic-connection.ts";
import { Registrar } from "../../p2p/connection/registrar.ts";
import { Upgrader } from "../../p2p/connection/upgrader.ts";
import { Connection } from "../../p2p/index.ts";
import { mplex, MplexStream } from "../../p2p/muxer/index.ts";
import { TransportListener } from "../../p2p/transport/rlpx/transport-listener.ts";
import { Transport } from "../../p2p/transport/rlpx/transport.ts";
import { bytesToUnprefixedHex } from "../../utils/index.ts";
import { ipPortToMultiaddr } from "../../utils/multi-addr.ts";
import { getHostPortFromMultiaddr } from "../../utils/utils.ts";

debug.enable("p2p:*,p2p:transport:*,p2p:connection:*");

// ============ Configuration ============

const LISTENER_PORT = 9000;

// ============ Node Structure ============

interface TestNode {
    index: string;
    name: string;
    udpPort: number;
    tcpPort: number;
    kademlia: KademliaNode;
	privateKey: Uint8Array;
	peerId: Uint8Array;
	encrypter: EcciesEncrypter;
	registrar: Registrar;
	upgrader: Upgrader;
	transport: Transport;
	listener?: TransportListener;
	connections: Map<string, BasicConnection>;
}

// ============ Helper Functions ============

function shortId(peerId: Uint8Array): string {
	return bytesToUnprefixedHex(peerId).slice(0, 8);
}

function log(nodeName: string, message: string) {
	const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
	console.log(`[${timestamp}] [${nodeName}] ${message}`);
}

function createTestNode(nodeIndex: number, udpPort: number, tcpPort: number): TestNode {
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
  
    // Create registrar for protocol handling
    const registrar = new Registrar({
      peerId: peerId,
    });
  
    // Create stream muxer factory
    const muxerFactory = mplex()();
  
    // Create upgrader
    const upgrader = new Upgrader(
      { registrar },
      {
        privateKey: privateKey,
        id: peerId,
        connectionEncrypter: encrypter,
        streamMuxerFactory: muxerFactory,
        skipEncryptionNegotiation: true,
        skipMuxerNegotiation: true,
      }
    );
  
    // Transport for outbound connections
    const transport = new Transport({
      upgrader,
      privateKey,
      id: peerId,
      dialOpts: {
        timeoutMs: 30000,
        maxActiveDials: 10,
      },
    });
  
    // Storage
    const connections = new Map<string, BasicConnection | Connection>();
    const protocolHandlers = new Map<string, (stream: MplexStream) => void>();
  
    // Listener for inbound connections
    const listener = transport.createListener({  });
  
    return {
      index: String(nodeIndex),
      name: `Node-${nodeIndex}`,
      privateKey,
      peerId,
      udpPort,
      tcpPort,
      kademlia,
      transport,
      listener,
      connections,
      registrar,
      upgrader,
      encrypter,
    };
  }
  
  // ============ Setup DHT Event Handlers ============
  
  function setupDHTEventHandlers(node: TestNode, allNodes: TestNode[]) {
    const { kademlia, index } = node;
  
    kademlia.events.on("listening", () => {
      log(index, `🔊 DHT listening on UDP:${node.udpPort} | ID: ${shortId(node.peerId)}`);
    });
  
    kademlia.events.on("peer:new", async (peer: PeerInfo) => {
      log(index, `🆕 DHT PEER:NEW - ${peer.address}:${peer.udpPort} | ID: ${shortId(peer.id)}`);
      
      // When we discover a new peer via DHT, try to establish TCP connection
      if (peer.tcpPort && peer.address && peer.id) {
        await testBasicConnection(node, peer);
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
  
// ============ Setup Server ============

async function setupServer(node: TestNode): Promise<void> {
	log(node.name, "Setting up RLPx listener...");

	// Create listener (transport provides upgrader, privateKey, and id automatically)
	const listener = node.transport.createListener({});

	// Handle incoming connections
	listener.on("connection", (basicConn: BasicConnection) => {
		const remotePeerId = bytesToUnprefixedHex(basicConn.remotePeer);
		const remoteAddr = basicConn.remoteAddr;
		const { host, port } = getHostPortFromMultiaddr(remoteAddr);

		log(node.name, `📥 INBOUND BasicConnection from peer ${remotePeerId.slice(0, 8)} at ${host}:${port}`);
		
		const connKey = `${host}:${port}`;
		node.connections.set(connKey, basicConn);

		// Handle connection close
		basicConn.addEventListener("close", () => {
			log(node.name, `🔌 BasicConnection ${connKey} closed`);
			node.connections.delete(connKey);
		});

		// Test reading from the connection
		basicConn.underlyingStream.addEventListener("message", (evt) => {
			log(node.name, `📨 Received ${evt.data.byteLength} bytes on connection ${connKey}`);
		});
	});

	listener.on("error", (error: Error) => {
		log(node.name, `❌ Listener error: ${error.message}`);
	});

	listener.on("listening", () => {
		log(node.name, `✅ Listener is now listening on port ${node.tcpPort}`);
	});

	// Listen on TCP port
	const listenAddr = ipPortToMultiaddr("127.0.0.1", node.tcpPort);
	await listener.listen(listenAddr);
	log(node.name, `🎧 Server listening on ${listenAddr.toString()}`);

	node.listener = listener;
}

// ============ Test BasicConnection ============

async function testBasicConnection(node: TestNode, peer: PeerInfo): Promise<void> {
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
      
      if (error || !connection) {
        log(node.index, `❌ TCP connection failed: ${error?.message ?? 'Unknown error'}`);
        return;
      }
  
      // Store the connection
      node.connections.set(connKey, connection);
      log(node.index, `✅ TCP connection established to ${connKey}`);
  
      // Set up connection close handler
      connection.addEventListener('close', () => {
        log(node.index, `🔌 Connection closed: ${connKey}`);
        node.connections.delete(connKey);
      });
  
    //   // Optionally: Open a ping stream to test the connection
    //   await testPingProtocol(node, connection, connKey);
  
    } catch (err: any) {
      log(node.index, `❌ TCP connection error: ${err.message}`);
    }
}

// ============ Main ============


async function main() {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║       DHT Discovery + ECIES TCP Connection Test           ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
    const nodes: TestNode[] = [];
  
    // Step 1: Create all nodes
    console.log("📦 Creating nodes...\n");
    for (let i = 0; i < 2; i++) {
      const udpPort = 9000 + i;
      const tcpPort = 9100 + i;
      const node = createTestNode(i, udpPort, tcpPort);
      nodes.push(node);
      
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
      
      log(`Node-${i}`, `Bootstrapping to Node-${i - 1}...`);
      try {
        await nodes[i].kademlia.bootstrap(bootstrapPeer);
        log(`Node-${i}`, `Bootstrap successful!`);
      } catch (err: any) {
        log(`Node-${i}`, `Bootstrap failed: ${err.message}`);
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
  
    process.on("SIGINT", async () => {
      console.log("\n\n🛑 Shutting down...");
      
      for (const node of nodes) {
        log(node.index, "Closing connections...");
        for (const conn of node.connections.values()) {
          try {
            await conn.close();
          } catch {}
        }
        await node.listener.close();
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
  

