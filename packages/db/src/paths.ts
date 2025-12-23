import type { ClientPaths } from '@ts-ethereum/chain-config'

export type DbPaths = {
  chainDbPath: string
  stateDbPath: string
  metaDbPath: string
}

/**
 * Get database paths from client paths
 */
export function getDbPaths(clientPaths: ClientPaths): DbPaths {
  return {
    chainDbPath: clientPaths.chainDir,
    stateDbPath: clientPaths.stateDir,
    metaDbPath: clientPaths.metaDir,
  }
}
