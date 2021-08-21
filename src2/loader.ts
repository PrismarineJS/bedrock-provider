const columns = {
  '1.3': require('./1.3/ChunkColumn')
}

function getChunk(version) {
  if (version['>=']('1.16.210')) return columns['1.3']) (version)
}

export default {
  chunk = getChunk
}