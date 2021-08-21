import mcData from 'minecraft-data'
import getChunk from '../chunk/loader'

function versionFromChunkVersion(chunkVersion) {
  return 'bedrock_1.17.10'
  // TODO: add data in mcData :
  // let last
  // for (const version of <any>mcData.versions.bedrock) {
  //   if (version.chunkVersion < chunkVersion) last = version
  //   else if (version.chunkVersion > chunkVersion) return last
  //   else if (version.chunkVersion === chunkVersion) return version
  // }
}

function convert(from, to, buf) {
  // Sometimes when loading chunks from disk the versions are not always consistent, so we run a converter
  // if it exists.
  // TODO
  return false
}

export function getChunkWrapper(chunkVersion: number, wantedChunkVersion: number) {
  const ChunkColumn = getChunk(versionFromChunkVersion(chunkVersion))
  return ChunkColumn
}