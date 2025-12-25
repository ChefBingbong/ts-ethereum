import type { CommandModule } from 'yargs'
import type { GlobalArgs } from '../options/globalOptions.js'
import { nodeCommand } from './node/index.js'

export const commands: CommandModule<GlobalArgs, any>[] = [nodeCommand]
