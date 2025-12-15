import { EthMessageCode } from "../definitions.ts";
import type { EthProtocol, EthStatusMsg, Sender } from "../protocol.ts";
import { Handler } from "./base-handler.ts";

export class StatusHandler extends Handler {
	constructor(protocol: EthProtocol) {
		super(protocol);
	}
	
	// For initiating STATUS (outbound)
	async handshakeInitiator(
		statusOpts: any,
		sender: Sender,
		timeout: number
	): Promise<any> {
		// Encode STATUS
		const statusMsg = this.protocol.spec.messages[EthMessageCode.STATUS];
		const encoded = statusMsg.encode(statusOpts);
		
		// Send STATUS
		sender.sendStatus(encoded);
		
		// Store our status
		(this.protocol as any)._statusRaw = encoded;
		
		// Wait for response
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`STATUS handshake timeout after ${timeout}ms`));
			}, timeout);
			
			sender.once('status', (response: any) => {
				clearTimeout(timeoutId);
				
				// Store peer status
				this.protocol.peerStatus = response as EthStatusMsg;
				
				// Validate status
				this.protocol._handleStatus();
				
				resolve(response);
			});
		});
	}
	
	// For responding to STATUS (inbound)
	async handshakeResponder(payload: any, context: any): Promise<void> {
		// Store peer status
		this.protocol.peerStatus = payload as EthStatusMsg;
		
		// If we haven't sent our STATUS yet, send it now
		if (!(this.protocol as any)._statusRaw) {
			const statusOpts = {
				chainId: this.protocol.chain.chainId,
				td: this.protocol.chain.blocks.td,
				bestHash: this.protocol.chain.blocks.latest!.hash(),
				genesisHash: this.protocol.chain.genesis.hash(),
				latestBlock: this.protocol.chain.blocks.latest!.header.number,
			};
			
			// Send STATUS response
			const sender = (this.protocol as any)._createSenderFromRlpx();
			if (sender) {
				const statusMsg = this.protocol.spec.messages[EthMessageCode.STATUS];
				const encoded = statusMsg.encode(statusOpts);
				sender.sendStatus(statusOpts);
				
				// Store our status
				(this.protocol as any)._statusRaw = encoded;
			}
		}
		
		// Validate status
		this.protocol._handleStatus();
		
		// Emit status event
		this.protocol.emit('status', payload);
	}
}
