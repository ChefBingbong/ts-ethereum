import { bytesToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { Peer } from "../../../net/peer/peer.ts";
import { createRpcMethod } from "../../validation.ts";
import { peersSchema } from "./schema.ts";

export const peers = (client: EthereumClient) =>
	createRpcMethod(peersSchema, async (_params, _c) => {
		try {
			const peers = client.service!.pool.peers as Peer[];

			return safeResult(
				peers?.map((peer) => {
					// Get RlpxConnection data
					const rlpxConn = peer.rlpxConnection;
					const name = (rlpxConn as any)?._hello?.clientId ?? null;
					
					// Get ETH protocol handler
					const protocols = (rlpxConn as any)?.protocols as Map<string, any>;
					const ethDescriptor = protocols?.get('eth');
					const ethHandler = ethDescriptor?.handler;
					
					return {
						id: peer.id,
						name,
						protocols: {
							eth: {
								head: ethHandler ? bytesToHex(new Uint8Array()) : bytesToHex(new Uint8Array()),
								difficulty: ethHandler ? ((ethHandler as any).status?.td?.toString(10) ?? "0") : "0",
								version: 68, // ETH/68
							},
						},
						caps: peer.registeredProtocols ? Array.from(peer.registeredProtocols).map(p => `${p}/68`) : [],
						network: {
							remoteAddress: peer.address,
						},
					};
				}),
			);
		} catch (error) {
			return safeError(error);
		}
	});
