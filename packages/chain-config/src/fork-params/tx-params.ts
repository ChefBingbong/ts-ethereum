import type { ParamsDict } from '../types'
import { EIP } from './enums'

export const paramsTx: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  [EIP.EIP_1]: {
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
  [EIP.EIP_1679]: {
    // gasPrices
    txDataNonZeroGas: 16n, // Per byte of data attached to a transaction that is not equal to zero. NOTE: Not payable on data of calls between transactions
  },
  /**
.  * Optional access lists
.  */
  [EIP.EIP_2930]: {
    // gasPrices
    accessListStorageKeyGas: 1900n, // Gas cost per storage key in an Access List transaction
    accessListAddressGas: 2400n, // Gas cost per storage key in an Access List transaction
  },
  /**
.  * Limit and meter initcode
.  */
  [EIP.EIP_3860]: {
    // gasPrices
    initCodeWordGas: 2n, // Gas to pay for each word (32 bytes) of initcode when creating a contract
    // format
    maxInitCodeSize: 49152, // Maximum length of initialization code when creating a contract (stays number - used with Number() cast)
  },
  /**
.  * Shard Blob Transactions
.  */
  [EIP.EIP_4844]: {
    blobCommitmentVersionKzg: 1, // The number indicated a versioned hash is a KZG commitment (stays number)
    blobGasPerBlob: 131072n, // The base fee for blob gas per blob
    maxBlobGasPerBlock: 786432n, // The max blob gas allowable per block
  },
  /**
   * PeerDAS - Peer Data Availability Sampling
   */
  [EIP.EIP_7594]: {
    maxBlobsPerTx: 6, // Max number of blobs per tx (stays number - count)
  },
  /**
   * Increase calldata cost to reduce maximum block size
   */
  [EIP.EIP_7623]: {
    totalCostFloorPerToken: 10n,
  },
  /**
.  * Set EOA account code for one transaction
.  */
  [EIP.EIP_7702]: {
    // TODO: Set correct minimum hardfork
    // gasPrices
    perAuthBaseGas: 12500n, // Gas cost of each authority item, provided the authority exists in the trie
    perEmptyAccountCost: 25000n, // Gas cost of each authority item, in case the authority does not exist in the trie (stays number - used with Number() cast)
  },
  /**
  .  * Shard Blob Transactions
  .  */
  [EIP.EIP_7691]: {
    maxBlobGasPerBlock: 1179648n, // The max blob gas allowable per block
  },
  /**
   * Transaction Gas Limit Cap
   */
  [EIP.EIP_7825]: {
    maxTransactionGasLimit: 16777216n, // Maximum gas limit for a single transaction (2^24)
  },
}
