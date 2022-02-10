import column13 from './1.3/ChunkColumn'
import PrismarineRegistry from 'prismarine-registry'
import PrismarineChunk, { BedrockChunk } from 'prismarine-chunk'

const columns = {
  1.3: column13
}

export default function getChunk (version) {
  let mcd = version
  if (typeof version === 'string') {
    mcd = PrismarineRegistry(version.startsWith('bedrock') ? version : 'bedrock_' + version)
    version = mcd.version
  }
  const mcv = 'bedrock_' + version.minecraftVersion
  return PrismarineChunk(mcv) as typeof BedrockChunk
}
