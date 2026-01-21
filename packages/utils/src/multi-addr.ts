import { type Multiaddr, multiaddr } from '@multiformats/multiaddr'

const isIPv4 = (ip: string): boolean => {
  return ipv4Regex.test(ip)
}

const isIPv6 = (ip: string): boolean => {
  return ipv6Regex.test(ip)
}

const ipv4Regex = /^(\d{1,3}\.){3,3}\d{1,3}$/
const ipv6Regex =
  /^(::)?(((\d{1,3}\.){3}(\d{1,3}){1})?([0-9a-f]){0,4}:{0,2}){1,8}(::)?$/i

export function ipPortToMultiaddr(
  ip: string,
  port: number | string,
): Multiaddr {
  if (typeof ip !== 'string') {
    throw new Error(`invalid ip provided: ${ip}`)
  }

  if (typeof port === 'string') {
    port = Number.parseInt(port, 10)
  }

  if (Number.isNaN(port)) {
    throw new Error(`invalid port provided: ${port}`)
  }

  if (isIPv4(ip)) {
    return multiaddr(`/ip4/${ip}/tcp/${port}`)
  }

  if (isIPv6(ip)) {
    return multiaddr(`/ip6/${ip}/tcp/${port}`)
  }

  throw new Error(`invalid ip:port for creating a multiaddr: ${ip}:${port}`)
}
