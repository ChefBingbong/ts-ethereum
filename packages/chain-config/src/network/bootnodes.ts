import { type Multiaddr, multiaddr } from '@multiformats/multiaddr'
import { bytesToUnprefixedHex, hexToBytes } from '@ts-ethereum/utils'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getNodeId } from './keys'

type PeerInfo = {
  id?: Uint8Array
  address?: string
  udpPort?: number | null
  tcpPort?: number | null
  vectorClock?: number
}

export function readBootnodeInfo(filepath: string): string | null {
  if (!existsSync(filepath)) {
    return null
  }

  try {
    const content = readFileSync(filepath, 'utf-8').trim()
    return content || null
  } catch (error) {
    throw new Error(`Failed to read bootnode info from ${filepath}: ${error}`)
  }
}

export function writeBootnodeInfo(
  filepath: string,
  port: number,
  nodeKey: Uint8Array,
): void {
  mkdirSync(path.dirname(filepath), { recursive: true })

  const nodeId = bytesToUnprefixedHex(getNodeId(nodeKey))
  const enodeUrl = `enode://${nodeId}@127.0.0.1:${port}`

  writeFileSync(filepath, enodeUrl)
}

export function enodeToMultiaddr(enodeUrl: string): Multiaddr | null {
  const match = enodeUrl.match(/^enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)$/)
  if (!match) {
    return null
  }

  const [, _nodeId, ip, port] = match
  return multiaddr(`/ip4/${ip}/tcp/${port}`)
}

export function enodeToDPTPeerInfo(enodeUrl: string): PeerInfo | null {
  const match = enodeUrl.match(/^enode:\/\/([a-fA-F0-9]+)@([^:]+):(\d+)$/)
  if (!match) {
    return null
  }

  const [, nodeIdHex, ip, port] = match
  const nodeId = hexToBytes(`0x${nodeIdHex}`)
  const tcpPort = Number.parseInt(port, 10)
  const udpPort = tcpPort

  return {
    id: nodeId,
    address: ip,
    tcpPort,
    udpPort,
  }
}
