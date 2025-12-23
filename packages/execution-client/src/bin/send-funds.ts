#!/usr/bin/env npx tsx

/**
 * Send funds between accounts from accounts.json
 *
 * Usage:
 *   npx tsx src/client/bin/send-funds.ts --from 0 --to 1 --amount 1.5
 *   npx tsx src/client/bin/send-funds.ts --from 0 --to 1 --amount 1.5 --rpc http://127.0.0.1:8001
 *
 * Options:
 *   --from     Index of sender account in accounts.json (default: 0 - the miner)
 *   --to       Index of recipient account in accounts.json (required)
 *   --amount   Amount to send in ETH (default: 1.0)
 *   --rpc      RPC URL (default: http://127.0.0.1:8001)
 *   --chainId  Chain ID (default: 12345)
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import {
  createWalletClient,
  defineChain,
  formatEther,
  type Hex,
  http,
  parseEther,
  publicActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const __filename = '../../test-network-data/accounts.json'
const __dirname = path.dirname(__filename)

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '')
    const value = args[i + 1]
    parsed[key] = value
  }

  return parsed
}

// Load accounts from accounts.json
interface AccountInfo {
  index: number
  address: string
  privateKey: string
  role: string
}

function loadAccounts(): AccountInfo[] {
  const accountsPath = path.resolve(
    __dirname,
    '../../../test-network-data/accounts.json',
  )

  if (!existsSync(accountsPath)) {
    console.error(`Accounts file not found: ${accountsPath}`)
    console.error(
      'Make sure to run the test network first to generate accounts.',
    )
    process.exit(1)
  }

  const content = readFileSync(accountsPath, 'utf8')
  return JSON.parse(content) as AccountInfo[]
}

// Get balance via RPC
async function getBalance(rpcUrl: string, address: string): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: Date.now(),
    }),
  })

  const json = (await response.json()) as {
    result?: string
    error?: { message: string }
  }

  if (json.error) {
    throw new Error(`RPC Error: ${json.error.message}`)
  }

  return BigInt(json.result || '0x0')
}

export async function getNonce(
  rpcUrl: string,
  address: string,
): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
      id: Date.now(),
    }),
  })

  const json = (await response.json()) as {
    result?: string
    error?: { message: string }
  }

  if (json.error) {
    throw new Error(`RPC Error: ${json.error.message}`)
  }

  return BigInt(json.result || '0x0')
}

async function main() {
  const args = parseArgs()

  // Config
  const rpcUrl = args.rpc || 'http://127.0.0.1:8545'
  const chainId = Number.parseInt(args.chainId || '12345', 10)
  const fromIndex = Number.parseInt(args.from || '0', 10)
  const toIndex = Number.parseInt(args.to || '', 10)
  const amount = args.amount || '1.0'

  if (Number.isNaN(toIndex)) {
    console.error('Error: --to is required (index of recipient account)')
    console.error('')
    console.error(
      'Usage: npx tsx src/client/bin/send-funds.ts --from 0 --to 1 --amount 1.5',
    )
    console.error('')
    console.error('Options:')
    console.error('  --from     Index of sender account (default: 0 - miner)')
    console.error('  --to       Index of recipient account (required)')
    console.error('  --amount   Amount to send in ETH (default: 1.0)')
    console.error('  --rpc      RPC URL (default: http://127.0.0.1:8001)')
    console.error('  --chainId  Chain ID (default: 12345)')
    process.exit(1)
  }

  // Load accounts
  const accounts = loadAccounts()

  if (fromIndex < 0 || fromIndex >= accounts.length) {
    console.error(
      `Error: --from index ${fromIndex} is out of range (0-${accounts.length - 1})`,
    )
    process.exit(1)
  }

  if (toIndex < 0 || toIndex >= accounts.length) {
    console.error(
      `Error: --to index ${toIndex} is out of range (0-${accounts.length - 1})`,
    )
    process.exit(1)
  }

  if (fromIndex === toIndex) {
    console.error('Error: --from and --to cannot be the same account')
    process.exit(1)
  }

  const fromAccount = accounts[fromIndex]
  const toAccount = accounts[toIndex]

  console.log('='.repeat(60))
  console.log('SEND FUNDS')
  console.log('='.repeat(60))
  console.log('')
  console.log('Configuration:')
  console.log(`  RPC URL:    ${rpcUrl}`)
  console.log(`  Chain ID:   ${chainId}`)
  console.log(`  Amount:     ${amount} ETH`)
  console.log('')
  console.log('From Account:')
  console.log(`  Index:      ${fromAccount.index}`)
  console.log(`  Address:    ${fromAccount.address}`)
  console.log(`  Role:       ${fromAccount.role}`)
  console.log('')
  console.log('To Account:')
  console.log(`  Index:      ${toAccount.index}`)
  console.log(`  Address:    ${toAccount.address}`)
  console.log(`  Role:       ${toAccount.role}`)
  console.log('')

  // Get balances before
  console.log('-'.repeat(60))
  console.log('BALANCES BEFORE:')
  console.log('-'.repeat(60))

  let fromBalanceBefore: bigint
  let toBalanceBefore: bigint

  try {
    fromBalanceBefore = await getBalance(rpcUrl, fromAccount.address)
    toBalanceBefore = await getBalance(rpcUrl, toAccount.address)

    console.log(`  ${fromAccount.role} (${fromAccount.address}):`)
    console.log(`    ${formatEther(fromBalanceBefore)} ETH`)
    console.log(`  ${toAccount.role} (${toAccount.address}):`)
    console.log(`    ${formatEther(toBalanceBefore)} ETH`)
  } catch (error) {
    console.error(`Failed to get balances: ${error}`)
    console.error('Make sure the RPC server is running.')
    process.exit(1)
  }

  // Check if sender has enough balance
  const amountWei = parseEther(amount)
  if (fromBalanceBefore < amountWei) {
    console.error('')
    console.error(`Error: Sender has insufficient balance`)
    console.error(`  Required: ${amount} ETH`)
    console.error(`  Available: ${formatEther(fromBalanceBefore)} ETH`)
    process.exit(1)
  }

  // Setup viem client
  const devnet = defineChain({
    id: chainId,
    name: 'local-devnet',
    network: 'local-devnet',
    nativeCurrency: {
      name: 'TestETH',
      symbol: 'TETH',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  })

  const account = privateKeyToAccount(fromAccount.privateKey as Hex)

  const client = createWalletClient({
    account,
    chain: devnet,
    transport: http(rpcUrl),
  }).extend(publicActions)

  // Send transaction
  console.log('')
  console.log('-'.repeat(60))
  console.log('SENDING TRANSACTION...')
  console.log('-'.repeat(60))

  try {
    const currentNonce = await getNonce(rpcUrl, fromAccount.address)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await client.sendTransaction({
      account,
      to: toAccount.address as Hex,
      nonce: currentNonce,
      value: amountWei,
      gasPrice: 2750000000,
      gas: 21000,
      type: 'legacy',
    } as any)

    console.log(`  Tx Hash: ${hash}`)
    console.log('')
    console.log('Waiting for receipt...')

    const receipt = await client.waitForTransactionReceipt({
      hash,
      pollingInterval: 100,
    })
    console.log(receipt)
    console.log(`  Block:   ${receipt.blockNumber}`)
    console.log(`  Status:  ${receipt.status}`)
    console.log(`  Gas Used: ${receipt.gasUsed}`)
  } catch (error) {
    console.error(error)
    console.error(`Transaction failed: ${error}`)
    process.exit(1)
  }

  // Get balances after
  console.log('')
  console.log('-'.repeat(60))
  console.log('BALANCES AFTER:')
  console.log('-'.repeat(60))

  const fromBalanceAfter = await getBalance(rpcUrl, fromAccount.address)
  const toBalanceAfter = await getBalance(rpcUrl, toAccount.address)

  console.log(`  ${fromAccount.role} (${fromAccount.address}):`)
  console.log(`    ${formatEther(fromBalanceAfter)} ETH`)
  console.log(
    `    Change: ${formatEther(fromBalanceAfter - fromBalanceBefore)} ETH`,
  )
  console.log(`  ${toAccount.role} (${toAccount.address}):`)
  console.log(`    ${formatEther(toBalanceAfter)} ETH`)
  console.log(
    `    Change: +${formatEther(toBalanceAfter - toBalanceBefore)} ETH`,
  )

  console.log('')
  console.log('='.repeat(60))
  console.log('TRANSFER COMPLETE!')
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
