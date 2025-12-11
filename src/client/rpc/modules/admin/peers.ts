import z from "zod";
import { bytesToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { RlpxPeer } from "../../../net/peer/rlpxpeer.ts";
import { createRpcMethod } from "../../validation.ts";
import { peersSchema } from "./schema.ts";

export const peers = (client: EthereumClient) =>
	createRpcMethod(peersSchema, async (_params, _c) => {
		try {
			const peers = client.service!.pool.peers as RlpxPeer[];

			return safeResult(
				peers?.map((peer) => {
					const rlpxPeer = peer.rlpxPeer;
					const name = rlpxPeer?.["_hello"]?.clientId ?? null;
					return {
						id: peer.id,
						name,
						protocols: {
							eth: {
								head:
									peer.eth?.updatedBestHeader !== undefined
										? bytesToHex(peer.eth.updatedBestHeader.hash())
										: bytesToHex(
												peer.eth?.status.bestHash ?? new Uint8Array(),
											),
								difficulty: peer.eth?.status.td.toString(10),
								version: peer.eth?.["versions"].slice(-1)[0] ?? null,
							},
						},
						caps: peer.eth?.["versions"].map((ver) => "eth/" + ver),
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

