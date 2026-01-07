#!/usr/bin/env npx tsx

/**
 * Deploy and interact with a smart contract using RPC calls
 * Based on @ethereumjs/vm/examples/run-solidity-contract.ts
 *
 * This script:
 * 1. Compiles a Solidity contract using solc
 * 2. Deploys the contract via eth_sendRawTransaction
 * 3. Interacts with the contract via eth_call
 *
 * Usage:
 *   npx tsx src/bin/deploy-contract-rpc.ts
 *   npx tsx src/bin/deploy-contract-rpc.ts --rpc http://localhost:8300
 *   npx tsx src/bin/deploy-contract-rpc.ts --rpc http://localhost:8300 --account 1
 *
 * Options:
 *   --rpc        RPC URL (default: http://localhost:8300)
 *   --chainId    Chain ID (default: 12345)
 *   --account    Index of account to use from accounts.json (default: 0)
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  type Hex,
  http,
  publicActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const scriptDir = path.resolve(
  process.cwd(),
  'packages/execution-client/src/bin',
)
const __filename = './test-network-data/accounts.json'
const __dirname = path.dirname(__filename)

const INITIAL_GREETING = 'Hello, World!'
const SECOND_GREETING = 'Hola, Mundo!'

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

/**
 * This function creates the input for the Solidity compiler.
 */
function getSolcInput() {
  const greeterPath = path.join(scriptDir, 'helpers', 'Greeter.sol')
  if (!existsSync(greeterPath)) {
    throw new Error(`Greeter.sol not found at ${greeterPath}`)
  }

  return {
    language: 'Solidity',
    sources: {
      'Greeter.sol': {
        content: readFileSync(greeterPath, 'utf8'),
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'spuriousDragon',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  }
}

/**
 * This function compiles all the contracts and returns the Solidity Standard JSON
 * output. If the compilation fails, it returns `undefined`.
 */
function compileContracts() {
  const input = getSolcInput()
  const output = JSON.parse(solc.compile(JSON.stringify(input)))

  let compilationFailed = false

  if (output.errors !== undefined) {
    for (const error of output.errors) {
      if (error.severity === 'error') {
        console.error(error.formattedMessage)
        compilationFailed = true
      } else {
        console.warn(error.formattedMessage)
      }
    }
  }

  if (compilationFailed) {
    return undefined
  }

  return output
}

function getGreeterDeploymentBytecode(solcOutput: any): string {
  return solcOutput.contracts['Greeter.sol'].Greeter.evm.bytecode.object
}

function getGreeterABI(solcOutput: any): any[] {
  return solcOutput.contracts['Greeter.sol'].Greeter.abi
}

async function deployContract(
  walletClient: any,
  publicClient: any,
  senderAddress: string,
  deploymentBytecode: string,
  greeting: string,
): Promise<string> {
  // Contracts are deployed by sending their deployment bytecode to the address 0
  // The contract params should be abi-encoded and appended to the deployment bytecode.
  const data =
    '0x' +
    deploymentBytecode +
    encodeAbiParameters([{ type: 'string' }], [greeting]).slice(2)

  const nonce = await publicClient.getTransactionCount({
    address: senderAddress as Hex,
  })

  // Send transaction via RPC using viem's sendTransaction
  const hash = await walletClient.sendTransaction({
    account: walletClient.account,
    data: data as Hex,
    gas: 2_000_000n,
    gasPrice: 100_000_000_000n, // 1 gwei
    nonce,
    // type: 'legacy',
  })

  console.log(`Transaction hash: ${hash}`)
  console.log('Waiting for deployment...')

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 3,
  })
  console.log('receipt', receipt)

  if (!receipt.contractAddress) {
    throw new Error(
      'Contract deployment failed - no contract address in receipt',
    )
  }

  console.log(`✅ Contract deployed at: ${receipt.contractAddress}`)
  console.log(`   Block number: ${receipt.blockNumber}`)
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`)

  return receipt.contractAddress
}

async function setGreeting(
  walletClient: any,
  publicClient: any,
  senderAddress: string,
  contractAddress: string,
  greeting: string,
  abi: any[],
) {
  const data = encodeFunctionData({
    abi,
    functionName: 'setGreeting',
    args: [greeting],
  })

  const nonce = await publicClient.getTransactionCount({
    address: senderAddress as Hex,
  })

  const hash = await walletClient.sendTransaction({
    account: walletClient.account,
    to: contractAddress as Hex,
    data: data as Hex,
    gas: 2_000_000n,
    gasPrice: 10_000_000_000n,
    nonce,
    // type: 'legacy',
  })

  console.log(`Transaction hash: ${hash}`)
  console.log('Waiting for transaction...')

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 3,
  })
  console.log('receipt', receipt)
  console.log('✅ Greeting updated!')
  console.log('Block number:', receipt.blockNumber)
  console.log('Gas used:', receipt.gasUsed.toString())
  console.log('Status:', receipt.status)
  console.log('Contract address:', receipt.contractAddress)
  console.log('Transaction hash:', hash)
  console.log('Transaction index:', receipt.transactionIndex)
  console.log('Transaction receipt:', receipt)
}

async function getGreeting(
  publicClient: any,
  contractAddress: string,
  callerAddress: string,
  abi: any[],
): Promise<string> {
  const sigHash = encodeFunctionData({
    abi,
    functionName: 'greet',
    args: [],
  })
  console.log('from', callerAddress)
  console.log('to', contractAddress)
  console.log('data', sigHash)

  // Use eth_call to read the contract
  const result = await publicClient.call({
    to: contractAddress as Hex,
    from: callerAddress as Hex,
    data: sigHash as Hex,
    gas: 2_000_000n,
    gasPrice: 10_000_000_000n,
    // type: 'legacy',
  })

  if (!result.data || result.data === '0x') {
    throw new Error('Contract call returned no data')
  }

  const decoded = decodeAbiParameters([{ type: 'string' }], result.data as Hex)

  return decoded[0] as string
}

async function main() {
  const args = parseArgs()

  // Config
  const rpcUrl = args.rpc || 'http://localhost:8300'
  const chainId = Number.parseInt(args.chainId || '12345', 10)
  const accountIndex = Number.parseInt(args.account || '0', 10)

  console.log('='.repeat(60))
  console.log('📦 SMART CONTRACT DEPLOYMENT & INTERACTION (RPC)')
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

  // Compile contract
  console.log('-'.repeat(60))
  console.log('COMPILING CONTRACT')
  console.log('-'.repeat(60))
  console.log('Compiling...')

  const solcOutput = compileContracts()
  if (solcOutput === undefined) {
    throw new Error('Compilation failed')
  } else {
    console.log('✅ Compiled the contract')
  }
  console.log('')

  const bytecode = getGreeterDeploymentBytecode(solcOutput)
  const abi = getGreeterABI(solcOutput)

  console.log('bytecode', bytecode)
  console.log('abi', abi)
  // Deploy contract
  console.log('-'.repeat(60))
  console.log('DEPLOYING CONTRACT')
  console.log('-'.repeat(60))
  console.log('Deploying the contract...')

  const contractAddress = await deployContract(
    walletClient,
    publicClient,
    account.address,
    bytecode,
    INITIAL_GREETING,
  )
  console.log('')

  // Read initial greeting
  console.log('-'.repeat(60))
  console.log('READING CONTRACT')
  console.log('-'.repeat(60))
  const greeting = await getGreeting(
    publicClient,
    contractAddress,
    account.address,
    abi,
  )

  console.log('Greeting:', greeting)

  if (greeting !== INITIAL_GREETING) {
    throw new Error(
      `initial greeting not equal, received ${greeting}, expected ${INITIAL_GREETING}`,
    )
  }
  console.log('')

  // Update greeting
  console.log('-'.repeat(60))
  console.log('UPDATING CONTRACT')
  console.log('-'.repeat(60))
  console.log('Changing greeting...')

  await setGreeting(
    walletClient,
    publicClient,
    account.address,
    contractAddress,
    SECOND_GREETING,
    abi,
  )
  console.log('')

  // Read updated greeting
  const greeting2 = await getGreeting(
    publicClient,
    contractAddress,
    account.address,
    abi,
  )

  console.log('Greeting:', greeting2)

  if (greeting2 !== SECOND_GREETING) {
    throw new Error(
      `second greeting not equal, received ${greeting2}, expected ${SECOND_GREETING}`,
    )
  }
  console.log('')

  console.log('='.repeat(60))
  console.log('✅ SUCCESS!')
  console.log('='.repeat(60))
  console.log(`Contract Address: ${contractAddress}`)
  console.log(`Final Greeting: ${greeting2}`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('Fatal error:', error)
  if (error instanceof Error) {
    console.error('Message:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  }
  process.exit(1)
})
