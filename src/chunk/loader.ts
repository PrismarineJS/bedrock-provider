import PrismarineRegistry from 'prismarine-registry'
import PrismarineChunk, { type BedrockChunk } from 'prismarine-chunk'

export default function getChunk (version) {
  let mcd = version
  if (typeof version === 'string') {
    mcd = PrismarineRegistry(version.startsWith('bedrock') ? version : 'bedrock_' + version)
    version = mcd.version
  }
  const mcv = 'bedrock_' + version.minecraftVersion
  return PrismarineChunk(mcv) as typeof BedrockChunk
}
