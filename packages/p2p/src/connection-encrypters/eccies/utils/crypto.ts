import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { getRandomBytesSync } from 'ethereum-cryptography/random'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { ecdh } from 'ethereum-cryptography/secp256k1-compat.js'
import { hexToBytes } from 'ethereum-cryptography/utils'
import crypto from 'node:crypto'
import { concatBytes } from '@ts-ethereum/utils'
import { assertEq, genPrivateKey, xor } from '@ts-ethereum/utils'
import { MAC } from '../mac'

const SHA256_BLOCK_SIZE = 64

export function ecdhX(publicKey: Uint8Array, privateKey: Uint8Array) {
  function hashfn(x: Uint8Array, y: Uint8Array) {
    const pubKey = new Uint8Array(33)
    pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03
    pubKey.set(x, 1)
    return pubKey.subarray(1)
  }
  return ecdh(publicKey, privateKey, { hashfn }, new Uint8Array(32))
}

export function concatKDF(keyMaterial: Uint8Array, keyLength: number) {
  const reps = ((keyLength + 7) * 8) / (SHA256_BLOCK_SIZE * 8)
  const bytes = []
  for (let counter = 0, tmp = new Uint8Array(4); counter <= reps; ) {
    counter += 1
    new DataView(tmp.buffer).setUint32(0, counter)
    bytes.push(
      Uint8Array.from(
        crypto.createHash('sha256').update(tmp).update(keyMaterial).digest(),
      ),
    )
  }
  return concatBytes(...bytes).subarray(0, keyLength)
}

export function eccieEncryptMessage(
  data: Uint8Array,
  remotePubKey: Uint8Array,
  sharedMacData: Uint8Array | null = null,
): Uint8Array | undefined {
  const privateKey = genPrivateKey()
  if (!remotePubKey) return
  const x = ecdhX(remotePubKey, privateKey)
  const key = concatKDF(x, 32)
  const ekey = key.subarray(0, 16)
  const mKey = crypto.createHash('sha256').update(key.subarray(16, 32)).digest()

  const cipherInitVector = getRandomBytesSync(16)
  const cipher = crypto.createCipheriv('aes-128-ctr', ekey, cipherInitVector)
  const encryptedData = Uint8Array.from(cipher.update(data))
  const dataIV = concatBytes(cipherInitVector, encryptedData)

  if (!sharedMacData) sharedMacData = Uint8Array.from([])
  const tag = Uint8Array.from(
    crypto
      .createHmac('sha256', mKey)
      .update(concatBytes(dataIV, sharedMacData))
      .digest(),
  )

  const publicKey = secp256k1.getPublicKey(privateKey, false)
  return concatBytes(publicKey, dataIV, tag)
}

export function decryptMessage(
  data: Uint8Array,
  privateKey: Uint8Array,
  sharedMacData: Uint8Array | null = null,
): Uint8Array {
  assertEq(data.subarray(0, 1), hexToBytes('0x04'), 'wrong ecies header', debug)
  const publicKey = data.subarray(0, 65)
  const dataIV = data.subarray(65, -32)
  const tag = data.subarray(-32)

  const x = ecdhX(publicKey, privateKey)
  const key = concatKDF(x, 32)
  const ekey = key.subarray(0, 16)
  const mKey = Uint8Array.from(
    crypto.createHash('sha256').update(key.subarray(16, 32)).digest(),
  )

  if (!sharedMacData) sharedMacData = Uint8Array.from([])
  const _tag = crypto
    .createHmac('sha256', mKey)
    .update(concatBytes(dataIV, sharedMacData))
    .digest()
  assertEq(_tag, tag, 'should have valid tag', debug)

  const IV = dataIV.subarray(0, 16)
  const encryptedData = dataIV.subarray(16)
  const decipher = crypto.createDecipheriv('aes-128-ctr', ekey, IV)
  return Uint8Array.from(decipher.update(encryptedData))
}

export function setupFrame(
  remoteData: Uint8Array,
  nonce: Uint8Array,
  remoteNonce: Uint8Array,
  initMsg: Uint8Array,
  ephemeralSharedSecret: Uint8Array,
  incoming: boolean,
) {
  const nonceMaterial = incoming
    ? concatBytes(nonce, remoteNonce)
    : concatBytes(remoteNonce, nonce)
  const hNonce = keccak256(nonceMaterial)

  if (!ephemeralSharedSecret) return
  const IV = new Uint8Array(16).fill(0x00)
  const sharedSecret = keccak256(concatBytes(ephemeralSharedSecret, hNonce))

  const aesSecret = keccak256(concatBytes(ephemeralSharedSecret, sharedSecret))
  const ingressAes = crypto.createDecipheriv('aes-256-ctr', aesSecret, IV)
  const egressAes = crypto.createDecipheriv('aes-256-ctr', aesSecret, IV)

  const macSecret = keccak256(concatBytes(ephemeralSharedSecret, aesSecret))
  const ingressMac = new MAC(macSecret)
  ingressMac.update(concatBytes(xor(macSecret, nonce), remoteData))
  const egressMac = new MAC(macSecret)

  if (initMsg === null || initMsg === undefined) return
  egressMac.update(concatBytes(xor(macSecret, remoteNonce), initMsg))

  return { ingressAes, egressAes, ingressMac, egressMac }
}
