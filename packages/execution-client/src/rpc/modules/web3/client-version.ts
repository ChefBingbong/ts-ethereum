import { safeResult } from '@ts-ethereum/utils'
import type { ExecutionNode } from '../../../node/index'
import { getClientVersion } from '../../../util/index'
import { createRpcMethod } from '../../validation'
import { clientVersionSchema } from './schema'

export const clientVersion = (_node: ExecutionNode) =>
  createRpcMethod(clientVersionSchema, async (_params, _c) => {
    return safeResult(getClientVersion())
  })
