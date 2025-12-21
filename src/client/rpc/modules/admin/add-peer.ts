import z from "zod";
import { DPT } from "../../../../devp2p/index.ts";
import { safeError, safeResult, safeTry } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
// RPC admin addPeer - TODO: Update for P2P architecture
// import { P2PPeer } from "../../../net/peer/p2p-peer.ts";
import type { FullEthereumService } from "../../../service/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { peerInfoSchema } from "./schema.ts";

export const addPeer = (
	client: EthereumClient,
	service: FullEthereumService,
	dpt: DPT,
) =>
	createRpcMethod(z.array(peerInfoSchema).length(1), async (params) => {
		const [error, peerInfo] = await safeTry(() => dpt.addPeer(params[0]));
		if (error) return safeError(error);

		// TODO: Update for P2P architecture - P2PPeer creation is handled by P2PPeerPool
		// service.pool.add(...);

		return safeResult(peerInfo !== undefined);
	});
