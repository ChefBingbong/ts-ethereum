
import { multiaddr } from "@multiformats/multiaddr";
import debug from "debug";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { genPrivateKey, pk2id } from "../../devp2p/index.ts";
import { EcciesEncrypter } from "../../p2p/connection-encrypters/eccies/eccies-encrypter.ts";
import { Connection } from "../../p2p/connection/connection.ts";
import { Registrar } from "../../p2p/connection/registrar.ts";
import { Upgrader } from "../../p2p/connection/upgrader.ts";
import { mplex, MplexStream } from "../../p2p/muxer/index.ts";
import { TransportListener } from "../../p2p/transport/tcp/transport-listener.ts";
import { Transport } from "../../p2p/transport/tcp/transport.ts";
import { bytesToUnprefixedHex } from "../../utils/index.ts";

debug.enable("p2p:*,p2p:transport:*,p2p:connection:*");

// ============ Configuration ============

const SERVER_TCP_PORT = 30401;
const CLIENT_TCP_PORT = 30402;

// ============ Node Structure ============

interface TestNode {
  name: string;
  privateKey: Uint8Array;
  peerId: Uint8Array;
  tcpPort: number;
  
  // Components
  encrypter: EcciesEncrypter;
  registrar: Registrar;
  upgrader: Upgrader;
  transport: Transport;
  listener?: TransportListener;
  
  // Connections
  connections: Map<string, Connection | Connection>;
}

// ============ Logging ============

function shortId(id: Uint8Array | undefined): string {
  if (!id) return "???";
  return bytesToUnprefixedHex(id).slice(0, 8);
}

function log(nodeName: string, message: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  console.log(`[${timestamp}] [${nodeName}] ${message}`);
}

// ============ Create a Test Node ============

function createTestNode(name: string, tcpPort: number): TestNode {
  const privateKey = genPrivateKey();
  const peerId = pk2id(secp256k1.getPublicKey(privateKey, false));

  log(name, `Created with peer ID: ${shortId(peerId)}`);

  // Create ECIES encrypter
  const encrypter = new EcciesEncrypter(privateKey, {
    requireEip8: true,
    id: peerId,
    remoteId: null,
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
      skipEncryptionNegotiation: false,
      skipMuxerNegotiation: false,
    }
  );

  // Create transport
  const transport = new Transport({
    upgrader: upgrader,
    dialOpts: { maxActiveDials: 10 },
  });

  return {
    name,
    privateKey,
    peerId,
    tcpPort,
    encrypter,
    registrar,
    upgrader,
    transport,
    connections: new Map(),
  };
}

// ============ Setup Server ============

async function setupServer(node: TestNode): Promise<void> {
  log(node.name, "Setting up server...");

  // Register a test protocol handler
  node.registrar.handle("/test/1.0.0", async (stream: MplexStream) => {
    log(node.name, `New stream on protocol /test/1.0.0: ${stream.id}`);
    
    // Echo back any data received
    (async () => {
      try {
        for await (const data of stream) {
          log(node.name, `Received on stream ${stream.id}: ${data.byteLength} bytes`);
          // Echo it back
          stream.send(data);
        }
      } catch (err: any) {
        log(node.name, `Stream ${stream.id} error: ${err.message}`);
      }
    })();
  });

  // Create listener
  const listener = node.transport.createListener({});

  // Handle incoming connections
  listener.on("connection", (conn: Connection | Connection) => {
    const connType = conn instanceof Connection ? "Full" : "Basic";
    log(node.name, `New ${connType} connection: ${conn.id} from peer ${shortId(conn.remotePeer)}`);
    
    node.connections.set(conn.id, conn);

    // Handle connection close
    conn.addEventListener("close", () => {
      log(node.name, `Connection ${conn.id} closed`);
      node.connections.delete(conn.id);
    });
  });

  // Listen on TCP port
  const listenAddr = multiaddr(`/ip4/127.0.0.1/tcp/${node.tcpPort}`);
  await listener.listen(listenAddr);
  log(node.name, `Server listening on ${listenAddr.toString()}`);

  node.listener = listener;
}

// ============ Test Scenarios ============

async function testConnection(client: TestNode, serverAddr: ReturnType<typeof multiaddr>, serverPeerId?: Uint8Array): Promise<void> {
  log(client.name, "=== Test 1: Dial with Connection ===");
  
  const result = await client.transport.dialBasic(serverAddr, serverPeerId);
  
  if (result[0]) {
    log(client.name, `Failed to dial: ${result[0].message}`);
    return;
  }

  const basicConn = result[1];
  log(client.name, `Successfully created Connection: ${basicConn.id}`);
  log(client.name, `Connection status: ${basicConn.status}`);
  log(client.name, `Encryption: ${basicConn.encryption || "none"}`);
  log(client.name, `Multiplexer: ${basicConn.multiplexer || "none"}`);

  client.connections.set(basicConn.id, basicConn);

  // Try to create a stream (should fail)
  try {
    await basicConn.newStream("/test/1.0.0");
    log(client.name, "ERROR: newStream() should have failed on Connection!");
  } catch (err: any) {
    log(client.name, `✓ Correctly rejected newStream() on Connection: ${err.message}`);
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Close basic connection
  await basicConn.close();
  log(client.name, "Closed Connection");
}

async function testUpgradeToFull(client: TestNode, serverAddr: ReturnType<typeof multiaddr>, serverPeerId?: Uint8Array): Promise<void> {
  log(client.name, "=== Test 2: Dial Basic, then Upgrade to Full ===");
  
  // Dial basic connection
  const dialResult = await client.transport.dialBasic(serverAddr, serverPeerId);
  if (dialResult[0]) {
    log(client.name, `Failed to dial: ${dialResult[0].message}`);
    return;
  }

  const basicConn = dialResult[1];
  log(client.name, `Created Connection: ${basicConn.id}`);

  // Upgrade to full connection
  log(client.name, "Upgrading to full Connection...");
  try {
    const fullConn = await basicConn.upgrade(
      client.upgrader.getComponents(),
      client.upgrader.getStreamMuxerFactory()
    );

    log(client.name, `✓ Successfully upgraded to FullConnection: ${fullConn.id}`);
    log(client.name, `Multiplexer: ${fullConn.multiplexer || "none"}`);
    log(client.name, `Streams: ${fullConn.streams.length}`);

    client.connections.set(fullConn.id, fullConn);

    // Now we can create streams!
    log(client.name, "Creating a test stream...");
    const stream = await fullConn.newStream("/test/1.0.0");
    log(client.name, `✓ Created stream: ${stream.id} protocol: ${stream.protocol}`);

    // Send some test data
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    stream.send(testData);
    log(client.name, `Sent ${testData.length} bytes on stream ${stream.id}`);

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Close stream
    await stream.close();
    log(client.name, "Closed stream");

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close connection
    await fullConn.close();
    log(client.name, "Closed FullConnection");
  } catch (err: any) {
    console.log(err);
    log(client.name, `✗ Upgrade failed: ${err.message}`);
    await basicConn.close();
  }
}

async function testDialFull(client: TestNode, serverAddr: ReturnType<typeof multiaddr>, serverPeerId?: Uint8Array): Promise<void> {
  log(client.name, "=== Test 3: Dial directly with FullConnection ===");
  
  const result = await client.transport.dialFull(serverAddr, serverPeerId);
  
  if (result[0]) {
    log(client.name, `Failed to dial: ${result[0].message}`);
    return;
  }

  const fullConn = result[1];
  log(client.name, `✓ Successfully created FullConnection: ${fullConn.id}`);
  log(client.name, `Multiplexer: ${fullConn.multiplexer || "none"}`);
  log(client.name, `Streams: ${fullConn.streams.length}`);

  client.connections.set(fullConn.id, fullConn);

  // Create multiple streams
  log(client.name, "Creating multiple streams...");
  for (let i = 0; i < 3; i++) {
    const stream = await fullConn.newStream("/test/1.0.0");
    log(client.name, `Created stream ${i + 1}: ${stream.id}`);
    
    const testData = new Uint8Array([i, i + 1, i + 2]);
    stream.send(testData);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    await stream.close();
  }

  log(client.name, `Total streams on connection: ${fullConn.streams.length}`);

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Close connection
  await fullConn.close();
  log(client.name, "Closed FullConnection");
}

// ============ Main ============

async function main() {
  log("MAIN", "Starting Connection test...");

  // Create server and client nodes
  const server = createTestNode("SERVER", SERVER_TCP_PORT);
  const client = createTestNode("CLIENT", CLIENT_TCP_PORT);

  try {
    // Setup server
    await setupServer(server);
    await new Promise(resolve => setTimeout(resolve, 500)); // Give server time to start

    const serverAddr = multiaddr(`/ip4/127.0.0.1/tcp/${SERVER_TCP_PORT}`);
    // Only pass peer ID if encryption is enabled
    const serverPeerId = server.encrypter ? server.peerId : undefined;

    log("MAIN", `Server peer ID: ${shortId(server.peerId)}`);
    log("MAIN", `Client peer ID: ${shortId(client.peerId)}`);
    log("MAIN", `Encryption: ${server.encrypter ? 'ECIES enabled' : 'DISABLED (testing without encryption)'}`);

    // // Run tests
    await testConnection(client, serverAddr, serverPeerId);
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testUpgradeToFull(client, serverAddr, serverPeerId);
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testDialFull(client, serverAddr, serverPeerId);

    log("MAIN", "All tests completed!");

    // Cleanup
    log("MAIN", "Cleaning up...");
    await client.transport.closeAllConnections();
    if (server.listener) {
      await server.listener.close();
    }

    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(0);
  } catch (err: any) {
    log("MAIN", `Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();

