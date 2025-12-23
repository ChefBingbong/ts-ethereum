import { Account, bytesToHex } from '@ts-ethereum/utils'

import type { AccountFields, StateManagerInterface } from '@ts-ethereum/chain-config'
import type { Address } from '@ts-ethereum/utils'

export async function modifyAccountFields(
  stateManager: StateManagerInterface,
  address: Address,
  accountFields: AccountFields,
): Promise<void> {
  const account = (await stateManager.getAccount(address)) ?? new Account()

  account.nonce = accountFields.nonce ?? account.nonce
  account.balance = accountFields.balance ?? account.balance
  account.storageRoot = accountFields.storageRoot ?? account.storageRoot
  account.codeHash = accountFields.codeHash ?? account.codeHash
  account.codeSize = accountFields.codeSize ?? account.codeSize
  if ('debug' in stateManager) {
    for (const [field, value] of Object.entries(accountFields)) {
      (stateManager as any).debug?.(
        `modifyAccountFields address=${address.toString()} ${field}=${value instanceof Uint8Array ? bytesToHex(value) : value} `,
      )
    }
  }
  await stateManager.putAccount(address, account)
}
