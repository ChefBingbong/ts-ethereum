import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  bytesToHex,
  createAddressFromPrivateKey,
  hexToBytes,
} from '@ts-ethereum/utils'
import type { Address } from 'viem'

export type Account = [address: Address, privateKey: Uint8Array]

export interface AccountInfo {
  index: number
  address: string
  privateKey: string
  role: string
}

export function derivePrivateKey(seed: string): Uint8Array {
  return createHash('sha256').update(seed).digest()
}

export function generateDeterministicAccount(
  seed: string,
  _index: number,
): Account {
  const privKey = derivePrivateKey(seed)
  const address = createAddressFromPrivateKey(privKey)
  return [address.toString() as Address, privKey]
}

export function generateAccounts(seeds: string[]): Account[] {
  return seeds.map((seed, i) => generateDeterministicAccount(seed, i))
}

export function readAccounts(filepath: string, seeds?: string[]): Account[] {
  if (!existsSync(filepath)) {
    return []
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    const accountsInfo: AccountInfo[] = JSON.parse(content)

    if (accountsInfo.length === 0 && seeds) {
      return generateAccounts(seeds)
    }

    return accountsInfo.map((info) => {
      const address = info.address.startsWith('0x')
        ? (info.address as Address)
        : (`0x${info.address}` as Address)
      const privateKeyHex = info.privateKey.startsWith('0x')
        ? info.privateKey
        : `0x${info.privateKey}`
      const privateKey = hexToBytes(privateKeyHex as `0x${string}`)
      return [address, privateKey] as Account
    })
  } catch (error) {
    throw new Error(`Failed to read accounts from ${filepath}: ${error}`)
  }
}

export function writeAccounts(filepath: string, accounts: Account[]): void {
  mkdirSync(path.dirname(filepath), { recursive: true })

  const accountsInfo: AccountInfo[] = accounts.map((account, i) => ({
    index: i,
    address: account[0].toString(),
    privateKey: bytesToHex(account[1]),
    role: i === 0 ? 'miner (bootnode)' : `user ${i}`,
  }))

  writeFileSync(filepath, JSON.stringify(accountsInfo, null, 2))
}

export function getNodeAccount(
  accounts: Account[],
  port: number,
  bootnodePort = 8000,
): Account {
  const nodeIndex = port - bootnodePort
  const accountIndex = Math.min(nodeIndex, accounts.length - 1)
  return accounts[accountIndex]
}
