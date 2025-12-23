import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { createRpcMethod } from '../../validation'
import { logLevels, verbositySchema } from './schema'

export const verbosity = (node: ExecutionNode) =>
  createRpcMethod(verbositySchema, async (params: [number], _c) => {
    const [level] = params
    node.config.options.logger?.configure({ level: logLevels[level] })
    return safeResult(`level: ${node.config.options.logger?.level}`)
  })
