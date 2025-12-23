import path from 'node:path'

export type ClientPathsPartial = Partial<{
  dataDir: string
  chainDir: string
  stateDir: string
  metaDir: string
  configDir: string
  peerIdFile: string
  accountsFile: string
  bootnodeFile: string
}>

export type ClientPaths = {
  dataDir: string
  chainDir: string
  stateDir: string
  metaDir: string
  configDir: string
  peerIdFile: string
  accountsFile: string
  bootnodeFile: string
}

/**
 * Defines the path structure of the files relevant to the client
 *
 * ```bash
 * $dataDir
 * ├── chain/          # Chain database
 * ├── state/           # State database
 * ├── meta/            # Meta database
 * ├── config/          # Config database
 * ├── peer-id.json     # Peer ID/private key
 * └── ../              # Shared files (parent directory)
 *     ├── accounts.json    # Accounts file (shared across nodes)
 *     └── bootnode.txt     # Bootnode info (shared)
 * ```
 */
export function getClientPaths(
  args: ClientPathsPartial & { dataDir?: string },
  network: string,
): ClientPaths {
  // Get dataDir from args or environment variable, with fallback
  const dataDir =
    args.dataDir ??
    process.env.DATA_DIR ??
    path.join(process.cwd(), 'datadir', network)

  const chainDir =
    args.chainDir ?? process.env.CHAIN_DIR ?? path.join(dataDir, 'chain')

  const stateDir =
    args.stateDir ?? process.env.STATE_DIR ?? path.join(dataDir, 'state')

  const metaDir =
    args.metaDir ?? process.env.META_DIR ?? path.join(dataDir, 'meta')

  const configDir =
    args.configDir ?? process.env.CONFIG_DIR ?? path.join(dataDir, 'config')

  const peerIdFile =
    args.peerIdFile ??
    process.env.PEER_ID_FILE ??
    path.join(dataDir, 'peer-id.json')

  // Accounts file is shared across nodes, so default to parent directory
  const accountsFile =
    args.accountsFile ??
    process.env.ACCOUNTS_FILE ??
    path.join(dataDir, '..', 'accounts.json')

  // Bootnode file is typically shared across nodes, so default to parent directory
  const bootnodeFile =
    args.bootnodeFile ??
    process.env.BOOTNODE_FILE ??
    path.join(dataDir, '..', 'bootnode.txt')

  return {
    dataDir,
    chainDir,
    stateDir,
    metaDir,
    configDir,
    peerIdFile,
    accountsFile,
    bootnodeFile,
  }
}

/**
 * Constructs representations of the path structure to show in command's description
 */
export const defaultClientPaths = getClientPaths(
  { dataDir: '$dataDir' },
  '$network',
)
