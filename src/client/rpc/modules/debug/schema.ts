import z from "zod";
import { INVALID_PARAMS } from "../../error-code.ts";

export interface tracerOpts {
	disableStack?: boolean;
	disableStorage?: boolean;
	enableMemory?: boolean;
	enableReturnData?: boolean;
	tracer?: string;
	timeout?: string;
	tracerConfig?: any;
}

export interface structLog {
	depth: number;
	gas: number;
	gasCost: number;
	op: string;
	pc: number;
	stack: string[] | undefined;
	memory: string[] | undefined;
	returnData: string[] | undefined;
	storage: {
		[key: string]: string;
	};
	error: boolean | undefined | null;
}

export const traceTransactionSchema = z.any();
export const traceCallSchema = z.any();
export const storageRangeAtSchema = z.any();
export const getRawBlockSchema = z.any();
export const getRawHeaderSchema = z.any();
export const getRawReceiptsSchema = z.any();
export const getRawTransactionSchema = z.any();
export const setHeadSchema = z.any();
export const verbositySchema = z.any();

/**
 * Validate tracer opts to ensure only supports opts are provided
 */
export const validateTracerConfig = (opts: tracerOpts): tracerOpts => {
	if (opts.tracerConfig !== undefined) {
		throw {
			code: INVALID_PARAMS,
			message: "custom tracers and tracer configurations are not implemented",
		};
	}
	if (opts.tracer !== undefined) {
		throw {
			code: INVALID_PARAMS,
			message: "custom tracers not implemented",
		};
	}
	if (opts.timeout !== undefined) {
		throw {
			code: INVALID_PARAMS,
			message: "custom tracer timeouts not implemented",
		};
	}

	if (opts.enableReturnData === true) {
		throw {
			code: INVALID_PARAMS,
			message: "enabling return data not implemented",
		};
	}
	return {
		...{
			disableStack: false,
			disableStorage: false,
			enableMemory: false,
			enableReturnData: false,
		},
		...opts,
	};
};

export const logLevels: { [key: number]: string } = {
	0: "error",
	1: "warn",
	2: "info",
	3: "debug",
};
