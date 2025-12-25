import type { ParamsDict } from '@ts-ethereum/chain-config'

// Only Frontier/Chainstart parameters
export const paramsTx: ParamsDict = {
  /**
   * Frontier/Chainstart
   */
  1: {
    // gasPrices
    txGas: 53000, // Per transaction. NOTE: Not payable on data of calls between transactions
    txCreationGas: 32000, // The cost of creating a contract via tx
    txDataZeroGas: 4, // Per byte of data attached to a transaction that equals zero
    txDataNonZeroGas: 68, // Per byte of data attached to a transaction that is not equal to zero
  },
}
