import { EIP } from './eips'

export const HARDFORK_ORDER = [
  'chainstart',
  'homestead',
  'dao',
  'tangerineWhistle',
  'spuriousDragon',
  'byzantium',
  'constantinople',
  'petersburg',
  'istanbul',
  'muirGlacier',
  'berlin',
  'london',
  'arrowGlacier',
  'grayGlacier',
  'paris',
  'mergeNetsplitBlock',
  'shanghai',
  'cancun',
  'prague',
  'osaka',
  'bpo1',
  'bpo2',
  'bpo3',
  'bpo4',
  'bpo5',
] as const

export type Hardfork = (typeof HARDFORK_ORDER)[number]

export const Hardfork = {
  Chainstart: 'chainstart',
  Homestead: 'homestead',
  Dao: 'dao',
  TangerineWhistle: 'tangerineWhistle',
  SpuriousDragon: 'spuriousDragon',
  Byzantium: 'byzantium',
  Constantinople: 'constantinople',
  Petersburg: 'petersburg',
  Istanbul: 'istanbul',
  MuirGlacier: 'muirGlacier',
  Berlin: 'berlin',
  London: 'london',
  ArrowGlacier: 'arrowGlacier',
  GrayGlacier: 'grayGlacier',
  Paris: 'paris',
  MergeNetsplitBlock: 'mergeNetsplitBlock',
  Shanghai: 'shanghai',
  Cancun: 'cancun',
  Prague: 'prague',
  Osaka: 'osaka',
  Bpo1: 'bpo1',
  Bpo2: 'bpo2',
  Bpo3: 'bpo3',
  Bpo4: 'bpo4',
  Bpo5: 'bpo5',
} as const satisfies Record<string, Hardfork>

export const HARDFORK_EIPS = {
  chainstart: [EIP.EIP_1],

  homestead: [EIP.EIP_606],

  tangerineWhistle: [EIP.EIP_608],

  spuriousDragon: [EIP.EIP_607],

  byzantium: [EIP.EIP_609],

  constantinople: [EIP.EIP_1013],

  petersburg: [EIP.EIP_1716],

  istanbul: [EIP.EIP_1679],

  muirGlacier: [EIP.EIP_2384],

  berlin: [EIP.EIP_2565, EIP.EIP_2929, EIP.EIP_2930, EIP.EIP_2718],
  london: [EIP.EIP_1559, EIP.EIP_3198, EIP.EIP_3529, EIP.EIP_3541],

  arrowGlacier: [EIP.EIP_4345],

  grayGlacier: [EIP.EIP_5133],

  paris: [EIP.EIP_3675, EIP.EIP_4399],

  shanghai: [EIP.EIP_3651, EIP.EIP_3855, EIP.EIP_3860, EIP.EIP_4895],

  cancun: [
    EIP.EIP_1153,
    EIP.EIP_4788,
    EIP.EIP_4844,
    EIP.EIP_5656,
    EIP.EIP_6780,
    EIP.EIP_7516,
    EIP.EIP_7594,
  ],

  prague: [
    EIP.EIP_2537,
    EIP.EIP_2935,
    EIP.EIP_6110,
    EIP.EIP_7002,
    EIP.EIP_7251,
    EIP.EIP_7623,
    EIP.EIP_7685,
    EIP.EIP_7691,
    EIP.EIP_7702,
    EIP.EIP_7825,
  ],

  osaka: [
    EIP.EIP_663,
    EIP.EIP_3540,
    EIP.EIP_3670,
    EIP.EIP_4200,
    EIP.EIP_4750,
    EIP.EIP_5450,
    EIP.EIP_6206,
    EIP.EIP_7069,
    EIP.EIP_7480,
    EIP.EIP_7620,
    EIP.EIP_7692,
    EIP.EIP_7698,
    EIP.EIP_7934,
    EIP.EIP_7939,
  ],

  dao: [],

  mergeNetsplitBlock: [],

  bpo1: [EIP.EIP_BPO1_BLOBS],
  bpo2: [EIP.EIP_BPO2_BLOBS],
  bpo3: [],
  bpo4: [],
  bpo5: [],
} as const satisfies Record<Hardfork, readonly number[]>

export type HardforkEIPs = typeof HARDFORK_EIPS

export function getHardforkIndex(hardfork: Hardfork): number {
  return HARDFORK_ORDER.indexOf(hardfork)
}

export function getHardforkSequence(hardfork: Hardfork): readonly Hardfork[] {
  const index = getHardforkIndex(hardfork)
  return HARDFORK_ORDER.slice(0, index + 1)
}

export function getActiveEIPsAtHardfork(hardfork: Hardfork): Set<number> {
  const eips = new Set<number>()
  const sequence = getHardforkSequence(hardfork)

  for (const hf of sequence) {
    for (const eip of HARDFORK_EIPS[hf]) {
      eips.add(eip)
    }
  }

  return eips
}
