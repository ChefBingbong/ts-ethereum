import { BIGINT_0, hexToBytes } from '@ts-ethereum/utils'

export type Chain = (typeof Chain)[keyof typeof Chain]

export const Chain = {
  Mainnet: 1,
  Sepolia: 11155111,
  Holesky: 17000,
  Hoodi: 560048,
} as const

// Reverse mapping: from numeric value back to the key name
export const ChainNameFromNumber: { [key in Chain]: string } = Object.entries(
  Chain,
).reduce(
  (acc, [key, value]) => {
    acc[value as Chain] = key
    return acc
  },
  {} as { [key in Chain]: string },
)

/**
 * Genesis state meta info which is decoupled from common's genesis params
 */
type GenesisState = {
  name: string
  /* blockNumber that can be used to update and track the regenesis marker */
  blockNumber: bigint
  /* stateRoot of the chain at the blockNumber */
  stateRoot: Uint8Array
}

// Having this info as record will force typescript to make sure no chain is missed
/**
 * GenesisState info about well known ethereum chains
 */
export const ChainGenesis: Record<Chain, GenesisState> = {
  [Chain.Mainnet]: {
    name: 'mainnet',
    blockNumber: BIGINT_0,
    stateRoot: hexToBytes(
      '0xd7f8974fb5ac78d9ac099b9ad5018bedc2ce0a72dad1827a1709da30580f0544',
    ),
  },
  [Chain.Sepolia]: {
    name: 'sepolia',
    blockNumber: BIGINT_0,
    stateRoot: hexToBytes(
      '0x5eb6e371a698b8d68f665192350ffcecbbbf322916f4b51bd79bb6887da3f494',
    ),
  },
  [Chain.Holesky]: {
    name: 'holesky',
    blockNumber: BIGINT_0,
    stateRoot: hexToBytes(
      '0x69d8c9d72f6fa4ad42d4702b433707212f90db395eb54dc20bc85de253788783',
    ),
  },
  [Chain.Hoodi]: {
    name: 'hoodi',
    blockNumber: BIGINT_0,
    stateRoot: hexToBytes(
      '0xda87d7f5f91c51508791bbcbd4aa5baf04917830b86985eeb9ad3d5bfb657576',
    ),
  },
}

export type Hardfork = (typeof Hardfork)[keyof typeof Hardfork]

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
  MergeNetsplitBlock: 'mergeNetsplitBlock',
  Paris: 'paris',
  Shanghai: 'shanghai',
  Cancun: 'cancun',
  Prague: 'prague',
  Osaka: 'osaka',
  Bpo1: 'bpo1',
  Bpo2: 'bpo2',
  Bpo3: 'bpo3',
  Bpo4: 'bpo4',
  Bpo5: 'bpo5',
} as const

export type ConsensusType = (typeof ConsensusType)[keyof typeof ConsensusType]

export const ConsensusType = {
  ProofOfStake: 'pos',
  ProofOfWork: 'pow',
  ProofOfAuthority: 'poa',
} as const

export type ConsensusAlgorithm =
  (typeof ConsensusAlgorithm)[keyof typeof ConsensusAlgorithm]

export const ConsensusAlgorithm = {
  Ethash: 'ethash',
  Clique: 'clique',
  Casper: 'casper',
} as const

/**
 * Enum for all supported EIPs
 * Each EIP maps to its official EIP number
 */
export type EIP = (typeof EIP)[keyof typeof EIP]

export const EIP = {
  // Hardfork Meta EIPs
  EIP_1: 1, // Frontier/Chainstart
  EIP_606: 606, // Homestead
  EIP_607: 607, // Spurious Dragon
  EIP_608: 608, // Tangerine Whistle
  EIP_609: 609, // Byzantium
  EIP_1013: 1013, // Constantinople
  EIP_1679: 1679, // Istanbul
  EIP_1716: 1716, // Petersburg
  EIP_2384: 2384, // Muir Glacier

  // Feature EIPs
  EIP_663: 663, // SWAPN, DUPN, EXCHANGE instructions
  EIP_1153: 1153, // Transient storage opcodes
  EIP_1559: 1559, // Fee market change (EIP-1559)
  EIP_2537: 2537, // BLS12-381 precompiles
  EIP_2565: 2565, // ModExp gas cost
  EIP_2718: 2718, // Typed Transaction Envelope
  EIP_2929: 2929, // Gas cost increases for state access opcodes
  EIP_2930: 2930, // Optional access lists
  EIP_2935: 2935, // Save historical block hashes in state
  EIP_3198: 3198, // BASEFEE opcode
  EIP_3529: 3529, // Reduction in refunds
  EIP_3540: 3540, // EVM Object Format (EOF) v1
  EIP_3541: 3541, // Reject new contracts starting with 0xEF
  EIP_3554: 3554, // Difficulty Bomb Delay to December 2021
  EIP_3607: 3607, // Reject transactions from senders with deployed code
  EIP_3651: 3651, // Warm COINBASE
  EIP_3670: 3670, // EOF - Code Validation
  EIP_3675: 3675, // Upgrade consensus to Proof-of-Stake
  EIP_3855: 3855, // PUSH0 instruction
  EIP_3860: 3860, // Limit and meter initcode
  EIP_4200: 4200, // EOF - Static relative jumps
  EIP_4345: 4345, // Difficulty Bomb Delay to June 2022
  EIP_4399: 4399, // Supplant DIFFICULTY with PREVRANDAO
  EIP_4750: 4750, // EOF - Functions
  EIP_4788: 4788, // Beacon block root in the EVM
  EIP_4844: 4844, // Shard Blob Transactions
  EIP_4895: 4895, // Beacon chain push withdrawals
  EIP_5133: 5133, // Difficulty Bomb Delay to September 2022
  EIP_5450: 5450, // EOF - Stack Validation
  EIP_5656: 5656, // MCOPY - Memory copying instruction
  EIP_6110: 6110, // Supply validator deposits on chain
  EIP_6206: 6206, // EOF - JUMPF and non-returning functions
  EIP_6780: 6780, // SELFDESTRUCT only in same transaction
  EIP_7002: 7002, // Execution layer triggerable withdrawals
  EIP_7069: 7069, // Revamped CALL instructions
  EIP_7251: 7251, // Increase MAX_EFFECTIVE_BALANCE
  EIP_7480: 7480, // EOF - Data section access instructions
  EIP_7516: 7516, // BLOBBASEFEE opcode
  EIP_7594: 7594, // PeerDAS blob transactions
  EIP_7620: 7620, // EOF Contract Creation
  EIP_7623: 7623, // Increase calldata cost
  EIP_7685: 7685, // General purpose execution layer requests
  EIP_7691: 7691, // Blob throughput increase
  EIP_7692: 7692, // EVM Object Format (EOFv1) Meta
  EIP_7698: 7698, // EOF - Creation transaction
  EIP_7702: 7702, // Set EOA account code for one transaction
  EIP_7709: 7709, // Use historical block hashes for BLOCKHASH
  EIP_7823: 7823, // Set upper bounds for MODEXP
  EIP_7825: 7825, // Transaction Gas Limit Cap
  EIP_7864: 7864, // Ethereum state using unified binary tree
  EIP_7883: 7883, // ModExp Gas Cost Increase
  EIP_7918: 7918, // Blob base fee bounded by execution cost
  EIP_7934: 7934, // RLP Execution Block Size Limit
  EIP_7939: 7939, // Count leading zeros (CLZ) opcode
  EIP_7951: 7951, // Precompile for secp256r1 Curve Support
} as const

/**
 * Ordered array of all hardforks for iteration
 */
export const HARDFORK_ORDER: Hardfork[] = [
  Hardfork.Chainstart,
  Hardfork.Homestead,
  Hardfork.Dao,
  Hardfork.TangerineWhistle,
  Hardfork.SpuriousDragon,
  Hardfork.Byzantium,
  Hardfork.Constantinople,
  Hardfork.Petersburg,
  Hardfork.Istanbul,
  Hardfork.MuirGlacier,
  Hardfork.Berlin,
  Hardfork.London,
  Hardfork.ArrowGlacier,
  Hardfork.GrayGlacier,
  Hardfork.MergeNetsplitBlock,
  Hardfork.Paris,
  Hardfork.Shanghai,
  Hardfork.Cancun,
  Hardfork.Prague,
  Hardfork.Osaka,
  Hardfork.Bpo1,
  Hardfork.Bpo2,
  Hardfork.Bpo3,
  Hardfork.Bpo4,
  Hardfork.Bpo5,
]
