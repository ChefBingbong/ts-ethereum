#!/usr/bin/env bun


import {
    derivePrivateKey,
    generateAccounts,
    writeAccounts,
    writePrivateKey,
} from '@ts-ethereum/chain-config'
import { Ethash } from '@ts-ethereum/consensus'
import { initDatabases } from '@ts-ethereum/db'
import { bytesToHex, KeyEncoding, ValueEncoding } from '@ts-ethereum/utils'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { getCacheSize, getFullSize } from '../packages/consensus/src/util'
import { LevelDB } from '../packages/execution-client/src/execution/level'

// Fixed seeds for deterministic test accounts
const ACCOUNT_SEEDS = [
  'sanity-check-account-0',
  'sanity-check-account-1',
  'sanity-check-account-2',
  'sanity-check-account-3',
  'sanity-check-account-4',
]

// Fixed seeds for deterministic peer keys
const PEER_KEY_SEEDS = [
  'sanity-check-peer-key-node-1',
  'sanity-check-peer-key-node-2',
]

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures')
const NODE1_DIR = path.join(FIXTURES_DIR, 'node-1')
const NODE2_DIR = path.join(FIXTURES_DIR, 'node-2')

/**
 * Generate Ethash cache data for epoch 0
 */
async function generateEthashCacheData(chainDb: any) {
  const epoch = 0
  const seed = new Uint8Array(32) // Epoch 0 seed is all zeros
  const cacheSize = await getCacheSize(epoch)
  const fullSize = await getFullSize(epoch)

  console.log(`  Cache size: ${cacheSize.toLocaleString()} bytes`)
  console.log(`  Full size: ${fullSize.toLocaleString()} bytes`)

  // Create Ethash instance and generate cache
  const ethash = new Ethash(new LevelDB(chainDb) as any)
  const cache = ethash.mkcache(cacheSize, seed)
  await ethash.loadEpoc(BigInt(epoch))

  // Return cache in the format expected by LevelDB
  return {
    cacheSize,
    fullSize,
    seed: bytesToHex(seed),
    cache: cache.map((el) => bytesToHex(el)),
  }
}

/**
 * Write Ethash cache to a node's chainDB
 */
async function writeEthashCacheToDb(chainDB: any, cacheData: any) {
  const ETHASH_EPOCH_KEY = '0' // Key stored as string (KeyEncoding.Number uses utf8)
  // Wrap with LevelDB to handle encoding conversion
  const db = new LevelDB(chainDB)
  await db.put(0 as any, cacheData, {
    keyEncoding: KeyEncoding.Number,
    valueEncoding: ValueEncoding.JSON,
  })
}

/**
 * Generate databases for a node with Ethash cache pre-populated
 */
async function generateNodeDatabases(
  nodeDir: string,
  nodeName: string,
) {
  const dataDir = path.join(nodeDir, 'data')

  const dbPaths = {
    chainDbPath: path.join(dataDir, 'chain'),
    stateDbPath: path.join(dataDir, 'state'),
    metaDbPath: path.join(dataDir, 'meta'),
  }

  console.log(`  Creating databases for ${nodeName}...`)
  const databases = await initDatabases(dbPaths)
  
    // Generate Ethash cache
    console.log('\nGenerating Ethash cache for epoch 0...')
    console.log('  (This may take 5-10 seconds)')
  
    const startTime = Date.now()
    const cacheData = await generateEthashCacheData(databases.chainDB)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  Cache generated in ${elapsed}s`)

  // Write Ethash cache to chainDB
  await writeEthashCacheToDb(databases.chainDB, cacheData)
  console.log(`    ✓ Ethash cache written to chainDB`)

  // Close databases properly
  await databases.chainDB.close()
  await databases.stateDB.close()
  await databases.metaDB.close()
  console.log(`    ✓ Databases closed`)

  return dataDir
}

async function main() {
  console.log('='.repeat(44))
  console.log('  GENERATING SANITY CHECK SNAPSHOT')
  console.log('='.repeat(44))
  console.log()

  // Clean and recreate fixtures directory
  if (existsSync(FIXTURES_DIR)) {
    console.log('Cleaning existing fixtures directory...')
    rmSync(FIXTURES_DIR, { recursive: true, force: true })
  }

  mkdirSync(NODE1_DIR, { recursive: true })
  mkdirSync(NODE2_DIR, { recursive: true })
  console.log(`Created fixtures directory: ${FIXTURES_DIR}`)

  // Generate accounts
  console.log('\nGenerating accounts...')
  const accounts = generateAccounts(ACCOUNT_SEEDS)
  const accountsFile = path.join(FIXTURES_DIR, 'accounts.json')
  writeAccounts(accountsFile, accounts)

  console.log(`  Generated ${accounts.length} accounts:`)
  for (let i = 0; i < accounts.length; i++) {
    const role = i === 0 ? '(miner)' : ''
    console.log(`    [${i}] ${accounts[i][0]} ${role}`)
  }

  // Generate peer keys
  console.log('\nGenerating peer keys...')

  const node1Key = derivePrivateKey(PEER_KEY_SEEDS[0])
  const node1KeyFile = path.join(NODE1_DIR, 'peer-id.json')
  writePrivateKey(node1KeyFile, node1Key)
  console.log(`  Node 1 key: ${node1KeyFile}`)

  const node2Key = derivePrivateKey(PEER_KEY_SEEDS[1])
  const node2KeyFile = path.join(NODE2_DIR, 'peer-id.json')
  writePrivateKey(node2KeyFile, node2Key)
  console.log(`  Node 2 key: ${node2KeyFile}`)

  // Generate databases for both nodes with Ethash cache
  console.log('\nGenerating node databases with Ethash cache...')
  const node1DataDir = await generateNodeDatabases(
    NODE1_DIR,
    'Node 1',
  )
  const node2DataDir = await generateNodeDatabases(
    NODE2_DIR,
    'Node 2',
  )

  console.log('\n' + '='.repeat(44))
  console.log('  SNAPSHOT GENERATED SUCCESSFULLY')
  console.log('='.repeat(44))
  console.log('\nFiles created:')
  console.log(`  - ${accountsFile}`)
  console.log(`  - ${node1KeyFile}`)
  console.log(`  - ${node2KeyFile}`)
  console.log(`  - ${node1DataDir}/chain/ (with Ethash cache)`)
  console.log(`  - ${node2DataDir}/chain/ (with Ethash cache)`)
  console.log('\nRun sanity check with: bun scripts/sanity-check.ts')
}

main().catch(console.error)
