export class BaseChunkColumn {
  x: number
  z: number
  chunkVersion: number
  sections: BaseSubChunk[]
  minY: number
  maxY: number
}

export class BaseSubChunk {
  sectionVersion: number
  constructor(sectionVersion) {
    this.sectionVersion = sectionVersion
  }
}

function convert(from, to, buf) {
  return false
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

const columns = {
  '1.18': class {}
}

function getChunk (chunkVersion: number, wantedChunkVersion: number, buffers) {
  // Sometimes when loading chunks from disk the versions are not always consistent, so we run a converter
  // if it exists
  const ret = CC => {
    if (chunkVersion !== wantedChunkVersion) 
      return convert(chunkVersion, wantedChunkVersion, buffers) ?? new CC(buffers) 
    return new CC(buffers)
  }
  if (chunkVersion >= ChunkVersions['1.16.210.0']) return ret(columns['1.18'])
}