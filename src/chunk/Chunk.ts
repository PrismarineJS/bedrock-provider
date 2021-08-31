export interface Vec4 { x: number, y: number, z: number, l?: number }

export abstract class IChunkColumn {
  x: number
  z: number
  chunkVersion: number
  Section: BaseSubChunk
  sections: BaseSubChunk[]
  minY: number
  maxY: number
  entities
  addBlockEntity
  biomes
  heights
  newSection: (y) => any
  getSection: (y) => BaseSubChunk
  abstract setBlock (vec4, block): void
  abstract getBlock (vec4): void
  networkEncodeNoCache
}

export abstract class BaseSubChunk {
  sectionVersion: number
  constructor (sectionVersion) {
    this.sectionVersion = sectionVersion
  }

  abstract encode (storageFormat: StorageType, checksum?): Promise<Buffer>
}

// See the Blob docs for details
export enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}
