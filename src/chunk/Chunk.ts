import type { BedrockChunk } from 'prismarine-chunk'
export interface Vec4 { x: number, y: number, z: number, l?: number }

export abstract class BaseSubChunk {
  sectionVersion: number
  constructor (sectionVersion) {
    this.sectionVersion = sectionVersion
  }

  abstract encode (storageFormat: StorageType, checksum?): Promise<Buffer>
}

// See the Blob docs for details
export const enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}
