import type { ParamsDict } from "../chain-config";

/**
 * VM parameters for Frontier/Chainstart only.
 * This is a value-transfer-only blockchain - no EIP-specific params needed.
 */
export const paramsVM: ParamsDict = {
	/**
	 * Frontier/Chainstart
	 */
	1: {
		// gasConfig
		maxRefundQuotient: 2, // Maximum refund quotient; max tx refund is min(tx.gasUsed/maxRefundQuotient, tx.gasRefund)
		// pow
		minerReward: "5000000000000000000", // the amount a miner gets rewarded for mining a block (5 ETH)
	},
};
