# ECIES P2P Node Testing

This directory contains a complete peer-to-peer node implementation with ECIES encryption for secure connections.

## Features

- **ECIES Encryption**: Custom implementation of Elliptic Curve Integrated Encryption Scheme
- **TCP Transport**: Reliable transport layer with connection multiplexing
- **Protocol Support**: Built-in echo and ping protocols for testing
- **Interactive CLI**: Command-line interface for manual testing

## Quick Test

### Automated Test
Run the automated test that creates two nodes and tests ECIES handshake:

```bash
npm run test:eccies
# or
tsx script/test-eccies.ts
```

This will:
1. Start two nodes on ports 9001 and 9002
2. Establish an ECIES encrypted connection between them  
3. Test echo and ping protocols
4. Show RTT measurements
5. Clean shutdown

### Manual Interactive Test

#### Terminal 1 - Start first node:
```bash
PORT=9001 tsx script/createPeer.ts
```

#### Terminal 2 - Start second node:
```bash  
PORT=9002 tsx script/createPeer.ts
```

#### Terminal 2 - Connect to first node:
```
dial /ip4/127.0.0.1/tcp/9001
```

#### Test protocols:
```
ping /ip4/127.0.0.1/tcp/9001
echo /ip4/127.0.0.1/tcp/9001 Hello World!
info
connections
```

## CLI Commands

- `dial <multiaddr>` - Establish ECIES encrypted connection
- `ping <multiaddr>` - Test connection with ping/pong
- `echo <multiaddr> <message>` - Send echo message
- `connections` - Show active connections
- `info` - Display node information
- `help` - Show all commands

## ECIES Implementation Details

### Handshake Flow
1. **Initiator** sends AUTH message (EIP8 or legacy format)
2. **Responder** receives AUTH, sends ACK message
3. Both derive shared secrets using ECDH
4. Encrypted communication channel established

### Security Features
- Elliptic Curve Diffie-Hellman (ECDH) key exchange
- AES encryption for message payloads
- Authentication to prevent man-in-the-middle attacks
- Forward secrecy through ephemeral keys

### Components
- `EcciesEncrypter` - Main ECIES implementation
- `PeerNode` - Complete P2P node with transport
- `Transport` - TCP connection management
- `TransportListener` - Incoming connection handling
- `MuxedConnection` - Connection multiplexing

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   PeerNode A    │    │   PeerNode B    │
├─────────────────┤    ├─────────────────┤
│   Transport     │◄──►│   Transport     │
├─────────────────┤    ├─────────────────┤
│ EcciesEncrypter │◄──►│ EcciesEncrypter │
├─────────────────┤    ├─────────────────┤
│ TCP Connection  │◄──►│ TCP Connection  │
└─────────────────┘    └─────────────────┘
         │                       │
         └───── ECIES Encrypted ──┘
```

## Expected Output

### Successful Connection:
```
✓ ECIES handshake completed successfully!
Connection established to: /ip4/127.0.0.1/tcp/9001

--- Testing Echo Protocol ---
Node2 sending echo message: {text: "Hello from Node2!", timestamp: 1670000000000}
Node2 received echo response: {text: "Hello from Node2!", timestamp: 1670000000000}

--- Testing Ping Protocol ---  
Node2 sending ping: {type: "ping", ts: 1670000000000, from: "Node2"}
✓ Ping successful! RTT: 15ms

✅ All tests completed successfully!
ECIES encryption is working correctly between peers.
```

The implementation provides a complete, working example of ECIES encryption in a P2P context, ready for integration into larger blockchain or distributed systems.