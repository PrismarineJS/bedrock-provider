import type { BedrockChunk } from 'prismarine-chunk'
export interface Vec4 { x: number, y: number, z: number, l?: number }

// See the Blob docs for details
export const enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}
