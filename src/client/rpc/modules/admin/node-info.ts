import z from "zod";
import { bytesToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import type { FullEthereumService } from "../../../service/index.ts";
import { getClientVersion } from "../../../util/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { nodeInfoSchema } from "./schema.ts";

export const nodeInfo = (
	client: EthereumClient,
	service: FullEthereumService,
) =>
	createRpcMethod(nodeInfoSchema, async (_params, _c) => {
		try {
			const rlpxInfo = client.config.server!.getRlpxInfo();
			const latestHeader = service.chain.headers.latest!;
			const clientName = getClientVersion();

			return safeResult({
				name: clientName,
				enode: `enode://${rlpxInfo.id}@${rlpxInfo.listenAddr}`,
				id: rlpxInfo.id,
				ip: rlpxInfo.ip,
				listenAddr: rlpxInfo.listenAddr,
				ports: {
					discovery: rlpxInfo.ports.discovery,
					listener: rlpxInfo.ports.listener,
				},
				protocols: {
					eth: {
						difficulty: latestHeader.difficulty.toString(),
						genesis: bytesToHex(service.chain.genesis.hash()),
						head: bytesToHex(latestHeader.mixHash),
						network: service.chain.chainId.toString(),
					},
				},
			});
		} catch (error) {
			return safeError(error);
		}
	});

