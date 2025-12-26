import { Hardfork } from '@ts-ethereum/chain-config'
import { type Address, bytesToUnprefixedHex } from '@ts-ethereum/utils'

import { precompile01 } from './01-ecrecover'
import { precompile02 } from './02-sha256'
import { precompile03 } from './03-ripemd160'
import { precompile04 } from './04-identity'

import type { Common } from '@ts-ethereum/chain-config'
import type { PrecompileFunc, PrecompileInput } from './types'

interface PrecompileEntry {
  address: string
  check: PrecompileAvailabilityCheckType
  precompile: PrecompileFunc
  name: string
}

interface Precompiles {
  [key: string]: PrecompileFunc
}

type PrecompileAvailabilityCheckType =
  | PrecompileAvailabilityCheckTypeHardfork
  | PrecompileAvailabilityCheckTypeEIP

export type PrecompileAvailabilityCheck =
  (typeof PrecompileAvailabilityCheck)[keyof typeof PrecompileAvailabilityCheck]

export const PrecompileAvailabilityCheck = {
  EIP: 'eip',
  Hardfork: 'hardfork',
} as const

interface PrecompileAvailabilityCheckTypeHardfork {
  type: typeof PrecompileAvailabilityCheck.Hardfork
  param: string
}

interface PrecompileAvailabilityCheckTypeEIP {
  type: typeof PrecompileAvailabilityCheck.EIP
  param: number
}
const BYTES_19 = '00000000000000000000000000000000000000'
const ripemdPrecompileAddress = BYTES_19 + '03'

const precompileEntries: PrecompileEntry[] = [
  {
    address: BYTES_19 + '01',
    check: {
      type: PrecompileAvailabilityCheck.Hardfork,
      param: Hardfork.Chainstart,
    },
    precompile: precompile01,
    name: 'ECRECOVER (0x01)',
  },
  {
    address: BYTES_19 + '02',
    check: {
      type: PrecompileAvailabilityCheck.Hardfork,
      param: Hardfork.Chainstart,
    },
    precompile: precompile02,
    name: 'SHA256 (0x02)',
  },
  {
    address: BYTES_19 + '03',
    check: {
      type: PrecompileAvailabilityCheck.Hardfork,
      param: Hardfork.Chainstart,
    },
    precompile: precompile03,
    name: 'RIPEMD160 (0x03)',
  },
  {
    address: BYTES_19 + '04',
    check: {
      type: PrecompileAvailabilityCheck.Hardfork,
      param: Hardfork.Chainstart,
    },
    precompile: precompile04,
    name: 'IDENTITY (0x04)',
  }
]

const precompiles: Precompiles = {
  [BYTES_19 + '01']: precompile01,
  [BYTES_19 + '02']: precompile02,
  [ripemdPrecompileAddress]: precompile03,
  [BYTES_19 + '04']: precompile04,
}

type DeletePrecompile = {
  address: Address
}

type AddPrecompile = {
  address: Address
  function: PrecompileFunc
}

type CustomPrecompile = AddPrecompile | DeletePrecompile

function getActivePrecompiles(
  common: Common,
  customPrecompiles?: CustomPrecompile[],
): Map<string, PrecompileFunc> {
  const precompileMap = new Map()
  if (customPrecompiles) {
    for (const precompile of customPrecompiles) {
      precompileMap.set(
        bytesToUnprefixedHex(precompile.address.bytes),
        'function' in precompile ? precompile.function : undefined,
      )
    }
  }
  for (const entry of precompileEntries) {
    if (precompileMap.has(entry.address)) {
      continue
    }
    const type = entry.check.type

    if (
      (type === PrecompileAvailabilityCheck.Hardfork && common.gteHardfork(entry.check.param)) ||
      (entry.check.type === PrecompileAvailabilityCheck.EIP &&
        common.isActivatedEIP(entry.check.param))
    ) {
      precompileMap.set(entry.address, entry.precompile)
    }
  }
  return precompileMap
}

function getPrecompileName(addressUnprefixedStr: string) {
  if (addressUnprefixedStr.length < 40) {
    addressUnprefixedStr = addressUnprefixedStr.padStart(40, '0')
  }
  for (const entry of precompileEntries) {
    if (entry.address === addressUnprefixedStr) {
      return entry.name
    }
  }
  return ''
}

export {
  getActivePrecompiles,
  getPrecompileName,
  precompileEntries,
  precompiles,
  ripemdPrecompileAddress
}

export type { AddPrecompile, CustomPrecompile, DeletePrecompile, PrecompileFunc, PrecompileInput }
