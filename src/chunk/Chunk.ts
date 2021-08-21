export type Vec4 = { x: number, y: number, z: number, l?: number }

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
  abstract setBlock(vec4, block): void
  abstract getBlock(vec4): void
  networkEncodeNoCache
}

export abstract class BaseSubChunk {
  sectionVersion: number
  constructor(sectionVersion) {
    this.sectionVersion = sectionVersion
  }

  abstract encode(storageFormat: StorageType, checksum?): Promise<Buffer>
}

// See the Blob docs for details
export enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}

const data2minecraftVersion = {
  "0": "0.9.0.0", 
  "1": "0.9.2.0",
  "2": "0.9.5.0",
  "3": "0.17.0.0",
  "4": "0.18.0.0",
  "5": "0.18.0.0",
  "6": "1.2.0.0",
  "7": "1.2.0.0",
  "8": "1.3.0.0",
  "9": "1.8.0.0",
  "10": "1.9.0.0",
  "11": "1.10.0.0",
  "12": "1.11.0.0",
  "13": "1.11.1.0",
  "14": "1.11.2.0",
  "15": "1.12.0.0",
  "16": "1.15.999.9999",
  "17": "1.15.999.9999",
  "18": "1.16.0.0",
  "19": "1.16.0.0",
  "20": "1.16.100.56",
  "21": "1.16.100.58",
  "22": "1.16.210.0",
  "25": "1.17.0.0",
  "26": "1.17.0.0"
}

const ChunkVersions = {
  "0.18.0.0": 5, 
  "1.16.210.0": 22, 
  "0.9.2.0": 1, 
  "1.16.100.58": 21, 
  "1.11.2.0": 14, 
  "0.17.0.0": 3, 
  "1.17.0.0": 26, 
  "1.12.0.0": 15, 
  "1.2.0.0": 7, 
  "1.3.0.0": 8, 
  "0.9.0.0": 0, 
  "1.16.100.56": 20, 
  "1.15.999.9999": 17, 
  "1.8.0.0": 9, 
  "1.9.0.0": 10, 
  "1.10.0.0": 11, 
  "1.11.0.0": 12, 
  "1.16.0.0": 19, 
  "0.9.5.0": 2, 
  "1.11.1.0": 13
}

