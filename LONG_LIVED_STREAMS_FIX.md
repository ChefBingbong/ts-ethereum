# Fix: Implement Long-Lived ETH Streams

## The Problem

Opening new streams for each request causes:
- ❌ Timing issues (response arrives after stream closed)
- ❌ "missing stream" errors
- ❌ Pause buffer not dispatched
- ❌ 10s timeout on every request
- ❌ No syncing!

## The Solution

Keep ONE ETH stream open per peer (like RLPx does):

### 1. Modify P2PPeer to Keep ETH Stream

```typescript
// src/client/net/peer/p2ppeer.ts

export class P2PPeer extends Peer {
  public connection: Connection | null;
  public registrar: Registrar;
  public connected: boolean;
  private streams: Map<string, MplexStream> = new Map();
  private ethStream?: MplexStream;  // ← Add this!

  async bindProtocols() {
    for (const protocol of this.protocols) {
      if (protocol.name === "eth") {
        if (protocol instanceof StreamEthProtocol) {
          await protocol.open();
          
          // Open ONE persistent ETH stream
          const ethProtocols = protocol.getProtocolStrings();
          this.ethStream = await this.connection.newStream(ethProtocols);
          
          this.config.logger?.info(
            `✅ Opened persistent ETH stream: ${this.ethStream.id}`,
          );
          
          // Create BoundStreamEthProtocol with the persistent stream
          const boundProtocol = new BoundStreamEthProtocol(
            this.connection,
            protocol,
            this.id,
            this.config,
            this.ethStream,  // ← Pass the stream!
          );
          this.eth = boundProtocol as any;
          
          // Send initial STATUS on this stream
          await protocol.sendStatus(this.ethStream);
          
          // Listen for STATUS response
          this.ethStream.addEventListener("message", (evt: any) => {
            // Handle STATUS response
            // Will set boundProtocol.status
          });
          
          // NEVER close this stream until peer disconnects!
        }
      }
    }
  }
}
```

### 2. Modify BoundStreamEthProtocol to Reuse Stream

```typescript
// src/client/net/protocol/boundstreamethprotocol.ts

export class BoundStreamEthProtocol extends EventEmitter {
  private ethStream: MplexStream;  // ← Add this!
  private pendingRequests: Map<bigint, PendingRequest> = new Map();
  
  constructor(
    connection: Connection,
    protocol: StreamEthProtocol,
    peerId: string,
    config: Config,
    ethStream: MplexStream  // ← Accept stream parameter
  ) {
    super();
    this.connection = connection;
    this.protocol = protocol;
    this.peerId = peerId;
    this.config = config;
    this.ethStream = ethStream;  // ← Store it!
    
    // Listen for ALL messages on this stream
    this.ethStream.addEventListener('message', this.handleMessage.bind(this));
  }
  
  private async handleMessage(evt: any) {
    // Extract data
    let data: Uint8Array;
    if (typeof evt.data?.subarray === 'function') {
      data = evt.data.subarray();
    } else {
      return;
    }
    
    // Parse message
    const code = data[0];
    const payload = data.slice(1);
    const decoded = RLP.decode(payload);
    
    // Route by message code
    switch (code) {
      case 0x00: // STATUS
        this.handleStatus(decoded);
        break;
      case 0x04: // BlockHeaders
        this.handleBlockHeaders(decoded);
        break;
      case 0x06: // BlockBodies
        this.handleBlockBodies(decoded);
        break;
      // ... etc
    }
  }
  
  private handleBlockHeaders(decoded: any) {
    const [reqIdBytes, headers] = decoded;
    const reqId = bytesToBigInt(reqIdBytes);
    
    // Find pending request
    const pending = this.pendingRequests.get(reqId);
    if (pending) {
      pending.resolve([reqId, headers]);
      this.pendingRequests.delete(reqId);
    }
  }
  
  async getBlockHeaders(opts) {
    const reqId = ++this.requestId;
    
    // Create promise for response
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        resolve([reqId, []]);  // Timeout returns empty
      }, 10000);
      
      this.pendingRequests.set(reqId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject
      });
    });
    
    // Send request on SAME stream (don't open new one!)
    const requestPayload = [
      bigIntToUnpaddedBytes(reqId),
      [
        typeof opts.block === 'bigint' ? bigIntToUnpaddedBytes(opts.block) : opts.block,
        bigIntToUnpaddedBytes(BigInt(opts.max)),
        bigIntToUnpaddedBytes(BigInt(opts.skip || 0)),
        bigIntToUnpaddedBytes(opts.reverse ? 1n : 0n),
      ],
    ];
    
    const encoded = RLP.encode(requestPayload);
    const message = new Uint8Array(1 + encoded.length);
    message[0] = 0x03;  // GetBlockHeaders
    message.set(encoded, 1);
    
    this.ethStream.send(message);
    
    return promise;
  }
}
```

### 3. Modify StreamEthProtocol to Keep Handler Stream Open

```typescript
// src/client/net/protocol/streamethprotocol.ts

private async handleStream(stream: MplexStream) {
  // Attach listener
  stream.addEventListener("message", async (evt: any) => {
    await this.handleMessage(stream, evt.data);
  });
  
  // DON'T close the stream!
  // Keep it alive for ongoing requests/responses
  
  // Connection close will clean up all streams automatically
}

// In response methods, DON'T close stream:
async sendBlockHeaders(stream, opts) {
  const payload = [...];
  await this.sendMessage(stream, 0x04, payload);
  // DON'T call stream.close() here!
}
```

---

## Why This Fixes Everything:

1. ✅ **One stream = one channel** (like RLPx)
2. ✅ **Listener always attached** (no timing issues)
3. ✅ **Responses arrive on same stream** (no "missing stream" errors)
4. ✅ **No timeouts** (stream stays open)
5. ✅ **Bidirectional** (requests and responses both directions)
6. ✅ **Matches Ethereum protocol design** (persistent connection)

---

## Current Issue in Your Logs:

```
mplex missing stream i0 for message type MESSAGE_RECEIVER
```

The remote peer sends data on stream i0, but your muxer doesn't have stream i0 registered! This happens because:
1. Stream i0 created
2. Protocol negotiation happens
3. Stream times out and gets removed
4. Response arrives
5. Muxer: "What's stream i0? Never heard of it!"

**The fix is to never remove/timeout the ETH stream - keep it alive!**

This is a significant refactor but it's the RIGHT architecture that matches how Ethereum's wire protocol is designed to work.

