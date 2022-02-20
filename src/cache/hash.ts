import xxhash from 'xxhash-wasm'
let hasher
export async function getChecksum (buffer: Buffer | Uint8Array) {
  if (!hasher) {
    hasher = await xxhash()
  }
  return hasher.h64Raw(buffer)
}
