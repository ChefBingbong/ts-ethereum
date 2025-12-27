import type { ParamsDict } from '@ts-ethereum/chain-config'

export const paramsTx: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  1: {
    // gasPrices
    txGas: 21000n, // Per transaction. NOTE: Not payable on data of calls between transactions
    txCreationGas: 32000n, // The cost of creating a contract via tx
    txDataZeroGas: 4n, // Per byte of data attached to a transaction that equals zero. NOTE: Not payable on data of calls between transactions
    txDataNonZeroGas: 68n, // Per byte of data attached to a transaction that is not equal to zero. NOTE: Not payable on data of calls between transactions
    accessListStorageKeyGas: 0n,
    accessListAddressGas: 0n,
  },
  /**
.  * Istanbul HF Meta EIP
.  */
  1679: {
    blake2RoundGas: 1n, // Gas cost per round for the Blake2 F precompile
    bn254AddGas: 150n, // Gas costs for curve addition precompile
    bn254MulGas: 6000n, // Gas costs for curve multiplication precompile
    bn254PairingGas: 45000n, // Base gas costs for curve pairing precompile
    bn254PairingWordGas: 34000n, // Gas costs regarding curve pairing precompile input length
    sstoreSentryEIP2200Gas: 2300n, // Minimum gas required to be present for an SSTORE call, not consumed
    sstoreNoopEIP2200Gas: 800n, // Once per SSTORE operation if the value doesn't change
    sstoreDirtyEIP2200Gas: 800, // Once per SSTORE operation if a dirty value is changed
    sstoreInitEIP2200Gas: 20000n, // Once per SSTORE operation from clean zero to non-zero
    sstoreInitRefundEIP2200Gas: 19200n, // Once per SSTORE operation for resetting to the original zero value
    sstoreCleanEIP2200Gas: 5000n, // Once per SSTORE operation from clean non-zero to something else
    sstoreCleanRefundEIP2200Gas: 4200n, // Once per SSTORE operation for resetting to the original non-zero value
    sstoreClearRefundEIP2200Gas: 15000n, // Once per SSTORE operation for clearing an originally existing storage slot
    balanceGas: 700n, // Base fee of the BALANCE opcode
    extcodehashGas: 700n, // Base fee of the EXTCODEHASH opcode
    chainidGas: 2n, // Base fee of the CHAINID opcode
    selfbalanceGas: 5n, // Base fee of the SELFBALANCE opcode
    sloadGas: 800n, // Base fee of the SLOAD opcode
  },
  /**
.  * Optional access lists
.  */
  2930: {
    // gasPrices
    accessListStorageKeyGas: 1900, // Gas cost per storage key in an Access List transaction
    accessListAddressGas: 2400, // Gas cost per storage key in an Access List transaction
  },
  /**
.  * Limit and meter initcode
.  */
  3860: {
    // gasPrices
    initCodeWordGas: 2, // Gas to pay for each word (32 bytes) of initcode when creating a contract
    // format
    maxInitCodeSize: 49152, // Maximum length of initialization code when creating a contract
  },
  /**
.  * Shard Blob Transactions
.  */
  4844: {
    blobCommitmentVersionKzg: 1, // The number indicated a versioned hash is a KZG commitment
    blobGasPerBlob: 131072, // The base fee for blob gas per blob
    maxBlobGasPerBlock: 786432, // The max blob gas allowable per block
  },
  /**
   * PeerDAS - Peer Data Availability Sampling
   */
  7594: {
    maxBlobsPerTx: 6, // Max number of blobs per tx
  },
  /**
   * Increase calldata cost to reduce maximum block size
   */
  7623: {
    totalCostFloorPerToken: 10,
  },
  /**
.  * Set EOA account code for one transaction
.  */
  7702: {
    // TODO: Set correct minimum hardfork
    // gasPrices
    perAuthBaseGas: 12500n, // Gas cost of each authority item, provided the authority exists in the trie
    perEmptyAccountCost: 25000n, // Gas cost of each authority item, in case the authority does not exist in the trie
  },
  /**
  .  * Shard Blob Transactions
  .  */
  7691: {
    maxBlobGasPerBlock: 1179648, // The max blob gas allowable per block
  },
  /**
   * Transaction Gas Limit Cap
   */
  7825: {
    maxTransactionGasLimit: 16777216, // Maximum gas limit for a single transaction (2^24)
  },
}
