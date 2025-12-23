import type { ClientPaths } from "../chain-config/paths.ts";

export type DbPaths = {
	chainDbPath: string;
	stateDbPath: string;
	metaDbPath: string;
};

/**
 * Get database paths from client paths
 */
export function getDbPaths(clientPaths: ClientPaths): DbPaths {
	return {
		chainDbPath: clientPaths.chainDir,
		stateDbPath: clientPaths.stateDir,
		metaDbPath: clientPaths.metaDir,
	};
}
