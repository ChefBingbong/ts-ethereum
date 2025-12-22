import z from "zod";
import { bytesToHex } from "../../../../utils/index.ts";
import { safeError, safeResult } from "../../../../utils/safe.ts";
import type { ExecutionNode } from "../../../node/index.ts";
import { getClientVersion } from "../../../util/index.ts";
import { createRpcMethod } from "../../validation.ts";
import { nodeInfoSchema } from "./schema.ts";

export const nodeInfo = (node: ExecutionNode) =>
	createRpcMethod(nodeInfoSchema, async (_params, _c) => {
		try {
			const rlpxInfo = node.config.server!.getRlpxInfo();
			const latestHeader = node.chain.headers.latest!;
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
						genesis: bytesToHex(node.chain.genesis.hash()),
						head: bytesToHex(latestHeader.mixHash),
						network: node.chain.chainId.toString(),
					},
				},
			});
		} catch (error) {
			return safeError(error);
		}
	});
