import column13 from './1.3/ChunkColumn'

const columns = {
  1.3: column13
}

export default function getChunk (version): ReturnType<typeof column13> {
  if (typeof version === 'string') version = require('minecraft-data')(version).version
  const mcv = 'bedrock_' + version.majorVersion
  if (version['>=']('1.16.210')) return columns['1.3'](mcv)
}
