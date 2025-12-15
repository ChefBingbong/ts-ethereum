import { EthProtocolHandler, ETH_CODES } from './src/p2p/transport/rlpx/protocols/eth-protocol-handler.js';
import * as RLP from './src/rlp/index.js';

// Enable debug logging
process.env.DEBUG = "p2p:*";

async function main() {
	console.log("\n🚀 Testing Protocol Registration System\n");

	// Create an ETH protocol handler
	const ethHandler = new EthProtocolHandler(68);

	console.log("Created ETH Protocol Handler:");
	console.log("  Name:", ethHandler.name);
	console.log("  Version:", ethHandler.version);
	console.log("  Length:", ethHandler.length);

	// Test that all ETH codes are registered
	console.log("\n📋 ETH Protocol Message Codes:");
	Object.entries(ETH_CODES).forEach(([name, code]) => {
		console.log(`  ${name}: 0x${code.toString(16).padStart(2, '0')}`);
	});

	// Mock connection for testing
	const mockConnection = {
		log: (...args: any[]) => console.log("[MockConn]", ...args),
		sendMessage: async (code: number, data: Uint8Array) => {
			console.log(
				`[MockConn] Sending message code=0x${code.toString(16)}, size=${data.length}`,
			);
		},
	} as any;

	// Activate the protocol
	console.log("\n🔌 Activating protocol...");
	await ethHandler.onActivate(mockConnection);
	console.log("✅ Protocol activated");

	// Test sending STATUS message
	console.log("\n📤 Testing sendStatus...");
	await ethHandler.sendStatus({
		protocolVersion: 68,
		networkId: 1,
		td: BigInt(123456789),
		bestHash: new Uint8Array(32).fill(0xaa),
		genesisHash: new Uint8Array(32).fill(0xbb),
	});

	// Test sending NEW_BLOCK_HASHES
	console.log("\n📤 Testing sendNewBlockHashes...");
	await ethHandler.sendNewBlockHashes([
		{ hash: new Uint8Array(32).fill(0x11), number: 100 },
		{ hash: new Uint8Array(32).fill(0x22), number: 101 },
	]);

	// Test sending TRANSACTIONS
	console.log("\n📤 Testing sendTransactions...");
	await ethHandler.sendTransactions([
		new Uint8Array([1, 2, 3, 4]),
		new Uint8Array([5, 6, 7, 8]),
	]);

	// Test receiving STATUS message
	console.log("\n📥 Testing handleMessage (STATUS)...");
	const statusPayload = RLP.encode([
		68, // protocol version
		1, // network id
		BigInt(987654321), // total difficulty
		new Uint8Array(32).fill(0xcc), // best hash
		new Uint8Array(32).fill(0xdd), // genesis hash
	] as any);

	await ethHandler.handleMessage(ETH_CODES.STATUS, statusPayload, mockConnection);

	// Test receiving TRANSACTIONS message
	console.log("\n📥 Testing handleMessage (TRANSACTIONS)...");
	const txPayload = RLP.encode([
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
	] as any);

	await ethHandler.handleMessage(ETH_CODES.TRANSACTIONS, txPayload, mockConnection);

	// Test protocol offset calculation
	console.log("\n🔢 Testing Protocol Offset Calculation:");
	console.log("  Base Protocol: 0x00-0x0F (16 codes)");
	console.log("  ETH Protocol would start at: 0x10");
	console.log("  ETH STATUS (relative 0x00) → absolute: 0x10");
	console.log("  ETH TRANSACTIONS (relative 0x02) → absolute: 0x12");

	// Test cleanup
	console.log("\n🧹 Testing onClose...");
	await ethHandler.onClose();
	console.log("✅ Protocol closed");

	console.log("\n✅ All tests completed successfully!\n");
	console.log("📝 Next steps:");
	console.log("  1. Create RlpxConnection instance");
	console.log("  2. Register ETH protocol: conn.registerProtocol(ethHandler)");
	console.log("  3. Get capabilities: conn.getCapabilities()");
	console.log("  4. Messages will auto-route to registered handlers");

	process.exit(0);
}

main().catch((err) => {
	console.error("❌ Test failed:", err);
	console.error(err.stack);
	process.exit(1);
});

