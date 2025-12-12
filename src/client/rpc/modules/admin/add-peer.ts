import z from "zod";
import { DPT } from "../../../../devp2p/index.ts";
import { bytesToHex } from "../../../../utils/index.ts";
import { safeError, safeResult, safeTry } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { Config } from "../../../index.ts";
import { RlpxPeer } from "../../../net/peer/rlpxpeer.ts";
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

		service.pool.add(
			new RlpxPeer({
				config: new Config({ common: client.config.chainCommon }),
				id: bytesToHex(peerInfo.id),
				host: peerInfo.address,
				port: peerInfo.tcpPort,
			}),
		);

		return safeResult(peerInfo !== undefined);
	});
