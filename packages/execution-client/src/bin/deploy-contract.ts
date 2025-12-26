#!/usr/bin/env npx tsx

/**
 * Deploy and interact with a smart contract
 *
 * This script:
 * 1. Starts a local node (or connects to existing one)
 * 2. Deploys a simple Counter contract
 * 3. Interacts with the contract (increment, read value)
 *
 * Usage:
 *   npx tsx src/bin/deploy-contract.ts
 *   npx tsx src/bin/deploy-contract.ts --rpc http://localhost:8300
 *   npx tsx src/bin/deploy-contract.ts --rpc http://localhost:8300 --account 0
 *
 * Options:
 *   --rpc        RPC URL (default: http://localhost:8300)
 *   --chainId    Chain ID (default: 12345)
 *   --account    Index of account to use from accounts.json (default: 0)
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  type Hex,
  http,
  publicActions,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const __filename = '../../test-network-data/accounts.json'
const __dirname = path.dirname(__filename)

// Simple Counter contract bytecode and ABI
// This is a minimal Counter contract that stores a number and allows incrementing it
// Solidity source:
//   pragma solidity ^0.8.0;
//   contract Counter {
//       uint256 public count;
//       function increment() public { count++; }
//   }
const COUNTER_CONTRACT_BYTECODE =
  '608060405234801561001057600080fd5b5060b28061001f6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c80633fb5c1cb1460375780638381f58a146051575b600080fd5b603f60005481565b60405190815260200160405180910390f35b6065605c3660046077565b6067565b005b600080549080606683607e565b9190505550565b600060208284031215608857600080fd5b81356001600160a01b0381168114609e57600080fd5b9392505050565b60006001820160c357634e487b7160e01b600052601160045260246000fd5b506001019056fea2646970667358221220c89d8c927e0e0e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e864736f6c63430008110033' as Hex

const COUNTER_CONTRACT_ABI = [
  {
    inputs: [],
    name: 'increment',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'count',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '')
    const value = args[i + 1]
    if (key && value) {
      parsed[key] = value
    }
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

// Wait for RPC to be ready
async function waitForRPC(rpcUrl: string, maxRetries = 30): Promise<void> {
  console.log(`Waiting for RPC at ${rpcUrl} to be ready...`)
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      })
      if (response.ok) {
        const json = await response.json()
        if (json.result) {
          console.log('✅ RPC is ready!')
          return
        }
      }
    } catch (error) {
      // Ignore errors and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    process.stdout.write('.')
  }
  throw new Error(
    `RPC at ${rpcUrl} did not become ready after ${maxRetries} seconds`,
  )
}

async function main() {
  const args = parseArgs()

  // Config
  const rpcUrl = args.rpc || 'http://localhost:8300'
  const chainId = Number.parseInt(args.chainId || '12345', 10)
  const accountIndex = Number.parseInt(args.account || '0', 10)

  console.log('='.repeat(60))
  console.log('📦 SMART CONTRACT DEPLOYMENT & INTERACTION')
  console.log('='.repeat(60))
  console.log('')
  console.log('Configuration:')
  console.log(`  RPC URL:    ${rpcUrl}`)
  console.log(`  Chain ID:   ${chainId}`)
  console.log(`  Account:    ${accountIndex}`)
  console.log('')

  // Wait for RPC to be ready
  await waitForRPC(rpcUrl)
  console.log('')

  // Load accounts
  const accounts = loadAccounts()

  if (accountIndex < 0 || accountIndex >= accounts.length) {
    console.error(
      `Error: Account index ${accountIndex} is out of range (0-${accounts.length - 1})`,
    )
    process.exit(1)
  }

  const account = accounts[accountIndex]
  console.log('Account:')
  console.log(`  Index:      ${account.index}`)
  console.log(`  Address:    ${account.address}`)
  console.log(`  Role:       ${account.role}`)
  console.log('')

  // Setup chain and clients
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

  const viemAccount = privateKeyToAccount(account.privateKey as Hex)

  const walletClient = createWalletClient({
    account: viemAccount,
    chain: devnet,
    transport: http(rpcUrl),
  }).extend(publicActions)

  const publicClient = createPublicClient({
    chain: devnet,
    transport: http(rpcUrl),
  })

  // Check balance
  console.log('-'.repeat(60))
  console.log('CHECKING BALANCE')
  console.log('-'.repeat(60))
  const balance = await publicClient.getBalance({
    address: account.address as Hex,
  })
  console.log(`Balance: ${formatEther(balance)} ETH`)
  console.log('')

  if (balance === 0n) {
    console.error('❌ Account has zero balance. Please fund the account first.')
    process.exit(1)
  }

  // Deploy contract
  console.log('-'.repeat(60))
  console.log('DEPLOYING CONTRACT')
  console.log('-'.repeat(60))

  try {
    // Get current nonce for deployment transaction
    const nonce = await publicClient.getTransactionCount({
      address: account.address as Hex,
    })

    // Deploy contract by sending a transaction with contract bytecode
    const hash = await walletClient.sendTransaction({
      account: viemAccount,
      data: COUNTER_CONTRACT_BYTECODE,
      gas: 2_000_000n,
      gasPrice: 1_000_000_000n, // 1 gwei
      nonce,
      type: 'legacy',
    })

    console.log(`Transaction hash: ${hash}`)
    console.log('Waiting for deployment...')

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    const contractAddress = receipt?.contractAddress ?? zeroAddress

    // if (!contractAddress) {
    //   throw new Error('Contract deployment failed - no contract address in receipt')
    // }

    console.log(`✅ Contract deployed at: `, receipt)
    console.log(`   Block number: ${receipt.blockNumber}`)
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`)
    console.log('')

    // Interact with contract
    console.log('-'.repeat(60))
    console.log('INTERACTING WITH CONTRACT')
    console.log('-'.repeat(60))

    const code = await publicClient.getCode({
      address: contractAddress as Hex,
    })
    console.log('Code:', code)
    // Read initial value
    console.log('Reading initial counter value...')
    const initialValue = await publicClient.readContract({
      address: contractAddress as Hex,
      abi: COUNTER_CONTRACT_ABI,
      functionName: 'count',
    })
    console.log(`Initial counter value: ${initialValue.toString()}`)
    console.log('')

    // Increment counter
    console.log('Incrementing counter...')
    const incrementHash = await walletClient.writeContract({
      address: contractAddress as Hex,
      abi: COUNTER_CONTRACT_ABI,
      functionName: 'increment',
      account: viemAccount,
    })

    console.log(`Transaction hash: ${incrementHash}`)
    console.log('Waiting for transaction...')

    const incrementReceipt = await publicClient.waitForTransactionReceipt({
      hash: incrementHash,
    })

    console.log(`✅ Counter incremented!`)
    console.log(`   Block number: ${incrementReceipt.blockNumber}`)
    console.log(`   Gas used: ${incrementReceipt.gasUsed.toString()}`)
    console.log('')

    // Read updated value
    console.log('Reading updated counter value...')
    const updatedValue = await publicClient.readContract({
      address: contractAddress as Hex,
      abi: COUNTER_CONTRACT_ABI,
      functionName: 'count',
    })
    console.log(`Updated counter value: ${updatedValue.toString()}`)
    console.log('')

    // Increment again
    console.log('Incrementing counter again...')
    const incrementHash2 = await walletClient.writeContract({
      address: contractAddress as Hex,
      abi: COUNTER_CONTRACT_ABI,
      functionName: 'increment',
      account: viemAccount,
    })

    await publicClient.waitForTransactionReceipt({ hash: incrementHash2 })

    const finalValue = await publicClient.readContract({
      address: contractAddress as Hex,
      abi: COUNTER_CONTRACT_ABI,
      functionName: 'count',
    })
    console.log(`Final counter value: ${finalValue.toString()}`)
    console.log('')

    console.log('='.repeat(60))
    console.log('✅ SUCCESS!')
    console.log('='.repeat(60))
    console.log(`Contract Address: ${contractAddress}`)
    console.log(`Final Counter Value: ${finalValue.toString()}`)
    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ Error:', error)
    if (error instanceof Error) {
      console.error('Message:', error.message)
      if (error.stack) {
        console.error('Stack:', error.stack)
      }
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
