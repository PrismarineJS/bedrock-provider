export async function getChecksum(buffer: Buffer | Uint8Array) {
  if (!hasher) {
    hasher = await xxhash()
  }
  return Buffer.from(hasher.h64Raw(buffer))
}