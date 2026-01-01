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

export function getClientPaths(
  args: ClientPathsPartial & { dataDir?: string },
  network: string,
): ClientPaths {
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

  const accountsFile =
    args.accountsFile ??
    process.env.ACCOUNTS_FILE ??
    path.join(dataDir, '..', 'accounts.json')

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

export const defaultClientPaths = getClientPaths(
  { dataDir: '$dataDir' },
  '$network',
)
