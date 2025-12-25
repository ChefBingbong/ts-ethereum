import type { CommandModule } from 'yargs'
import type { GlobalArgs } from '../../options/globalOptions.js'
import { type NodeHandlerArgs, nodeHandler } from './handler.js'
import { nodeOptions } from './options.js'

export const nodeCommand: CommandModule<GlobalArgs, NodeHandlerArgs> = {
  command: 'node',
  describe: 'Start the execution client node',
  builder: (yargs) => {
    return yargs.options(nodeOptions) as any
  },
  handler: async (args) => {
    await nodeHandler(args)
  },
}
