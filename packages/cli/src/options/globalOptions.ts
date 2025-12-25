import type { Options } from 'yargs'

export type GlobalArgs = {
  dataDir: string
  logLevel: string
}

export const globalOptions: Record<keyof GlobalArgs, Options> = {
  dataDir: {
    description: 'Root data directory for the node',
    type: 'string',
    default: './data',
  },
  logLevel: {
    description: 'Logging verbosity level',
    type: 'string',
    choices: ['error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
  },
}
