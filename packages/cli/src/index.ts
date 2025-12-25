#!/usr/bin/env bun

import { getCli, yarg } from './cli.js'

const cli = getCli()

void cli
  .fail((msg, err) => {
    if (msg?.includes('Not enough non-option arguments')) {
      yarg.showHelp()
      console.log('\n')
    }

    const errorMessage =
      err !== undefined ? err.stack || err.message : msg || 'Unknown error'

    console.error(` ✖ ${errorMessage}\n`)
    process.exit(1)
  })
  .parse()
