import yargs, { type Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { commands } from './cmds/index.js'
import { globalOptions } from './options/globalOptions.js'

const VERSION = '0.0.1'
const topBanner = `⛓️  ts-ethereum: TypeScript Ethereum Execution Client
  * Version: ${VERSION}`

const bottomBanner = `📖 For more information, check the repository:
  * https://github.com/ChefBingbong/simple-p2p-blockchain`

export const yarg = yargs(hideBin(process.argv))

export function getCli(): Argv {
  const cli = yarg
    .env('TS_ETHEREUM')
    .parserConfiguration({
      'dot-notation': false,
    })
    .options(globalOptions)
    .scriptName('')
    .demandCommand(1)
    .showHelpOnFail(false)
    .usage(topBanner)
    .epilogue(bottomBanner)
    .version(topBanner)
    .alias('h', 'help')
    .alias('v', 'version')
    .recommendCommands()

  // Register all commands
  for (const cmd of commands) {
    cli.command(cmd as any)
  }

  cli.recommendCommands().strict()

  return cli
}
