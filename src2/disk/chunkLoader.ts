import { getChunk } from './loader'

function versionFromChunkVersion(chunkVersion) {
  let last
  for (const version of mcData.versions.bedrock) {
    if (version.chunkVersion < chunkVersion) last = version
    else if (version.chunkVersion > chunkVersion) return last
    else if (version.chunkVersion === chunkVersion) return version
  }
}

function convert(from, to, buf) {
  // TODO
  return false
}

function getChunkWrapper(chunkVersion: number, wantedChunkVersion: number, sections) {
  // Sometimes when loading chunks from disk the versions are not always consistent, so we run a converter
  // if it exists.
  const ChunkColumn = getChunk(versionFromChunkVersion(chunkVersion))
  if (chunkVersion !== wantedChunkVersion)
    return convert(chunkVersion, wantedChunkVersion, sections) ?? ChunkColumn.fromSections(buffers)
  return ChunkColumn.fromSections(buffers)
}