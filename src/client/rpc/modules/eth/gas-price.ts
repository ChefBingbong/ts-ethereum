import type { LegacyTx } from "../../../../tx/index.ts";
import { BIGINT_0, bigIntToHex } from "../../../../utils/index.ts";
import { safeResult } from "../../../../utils/safe.ts";
import type { EthereumClient } from "../../../client.ts";
import { createRpcMethod } from "../../validation.ts";
import { gasPriceSchema } from "./schema.ts";

export const gasPrice = (client: EthereumClient) => {
	const service = client.service as any;
	const chain = service.chain;
	return createRpcMethod(gasPriceSchema, async (_params, _c) => {
		const minGasPrice = BIGINT_0;
		let gasPrice = BIGINT_0;
		const latest = await chain.getCanonicalHeadHeader();

		const blockIterations = 20 < latest.number ? 20 : latest.number;
		let txCount = BIGINT_0;
		for (let i = 0; i < blockIterations; i++) {
			const block = await chain.getBlock(latest.number - BigInt(i));
			if (block.transactions.length === 0) {
				continue;
			}

			for (const tx of block.transactions) {
				const txGasPrice = (tx as LegacyTx).gasPrice;
				gasPrice += txGasPrice;
				txCount++;
			}
		}

		if (txCount > 0) {
			const avgGasPrice = gasPrice / txCount;
			gasPrice = avgGasPrice > minGasPrice ? avgGasPrice : minGasPrice;
		} else {
			gasPrice = minGasPrice;
		}

		return safeResult(bigIntToHex(gasPrice));
	});
};

