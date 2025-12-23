import { mkdirSync } from "node:fs";
import type { AbstractLevel } from "abstract-level";
import { DbController, type DbOptions } from "./controller.ts";
import type { DbPaths } from "./paths.ts";
import type { Logger } from "../client/logging.ts";

export interface Databases {
	chainDB: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;
	stateDB: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;
	metaDB: AbstractLevel<
		string | Uint8Array,
		string | Uint8Array,
		string | Uint8Array
	>;
}

/**
 * Initialize all databases (chain, state, meta)
 * Creates directories and opens database connections
 */
export async function initDatabases(
	paths: DbPaths,
	logger?: Logger,
): Promise<Databases> {
	// Create directories
	mkdirSync(paths.chainDbPath, { recursive: true });
	mkdirSync(paths.stateDbPath, { recursive: true });
	mkdirSync(paths.metaDbPath, { recursive: true });

	// Initialize database controllers
	const chainController = await DbController.create(
		{ name: paths.chainDbPath },
		{ logger },
	);

	const stateController = await DbController.create(
		{ name: paths.stateDbPath },
		{ logger },
	);

	const metaController = await DbController.create(
		{ name: paths.metaDbPath },
		{ logger },
	);

	return {
		chainDB: chainController.getDb(),
		stateDB: stateController.getDb(),
		metaDB: metaController.getDb(),
	};
}
