import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { bytesToHex, genPrivateKey, hexToBytes } from '@ts-ethereum/utils'
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'

export interface PrivateKeyInfo {
  privateKey: Uint8Array
  nodeId: Uint8Array
}

function writeFile600Perm(filepath: string, content: string): void {
  mkdirSync(path.dirname(filepath), { recursive: true })
  writeFileSync(filepath, content, { mode: 0o600 })
}

export function readPrivateKey(filepath: string): Uint8Array {
  if (!existsSync(filepath)) {
    throw new Error(`Private key file not found: ${filepath}`)
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    const parsed = JSON.parse(content)

    const keyHex = parsed.privateKey ?? parsed
    if (typeof keyHex !== 'string') {
      throw new Error('Invalid private key format')
    }

    return hexToBytes(keyHex as `0x${string}`)
  } catch (error) {
    throw new Error(`Failed to read private key from ${filepath}: ${error}`)
  }
}

export function writePrivateKey(filepath: string, key: Uint8Array): void {
  const keyHex = bytesToHex(key)
  const content = JSON.stringify({ privateKey: keyHex }, null, 2)
  writeFile600Perm(filepath, content)
}

export function getNodeId(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, false).slice(1)
}

export function initPrivateKey(
  paths: { peerIdFile: string },
  logger?: any,
  persistNetworkIdentity = true,
): PrivateKeyInfo {
  const shouldPersist =
    persistNetworkIdentity ?? process.env.PERSIST_NETWORK_IDENTITY !== 'false'

  let privateKey: Uint8Array

  if (shouldPersist && existsSync(paths.peerIdFile)) {
    try {
      privateKey = readPrivateKey(paths.peerIdFile)
      logger?.debug(`Loaded private key from ${paths.peerIdFile}`)
    } catch (error) {
      logger?.warn(`Failed to read private key, generating new one: ${error}`)
      privateKey = genPrivateKey()
      if (shouldPersist) {
        writePrivateKey(paths.peerIdFile, privateKey)
        logger?.info(
          `Generated and saved new private key to ${paths.peerIdFile}`,
        )
      }
    }
  } else {
    privateKey = genPrivateKey()
    if (shouldPersist) {
      writePrivateKey(paths.peerIdFile, privateKey)
      logger?.info(`Generated and saved new private key to ${paths.peerIdFile}`)
    } else {
      logger?.debug('Generated new private key (not persisting)')
    }
  }

  const nodeId = getNodeId(privateKey)

  return {
    privateKey,
    nodeId,
  }
}
