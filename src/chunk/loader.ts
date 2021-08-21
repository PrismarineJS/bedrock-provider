const columns = {
  '1.3': require('./1.3/ChunkColumn')
}

export default function getChunk(version) {
  if (typeof version === 'string') version = require('minecraft-data')(version).version
  const mcv = 'bedrock_' + version.majorVersion
  console.log('MCV', mcv, version)
  if (version['>=']('1.16.210')) return columns['1.3'](mcv)
}