import { Stream } from 'src/Stream'
import { StorageType } from '../Chunk'
import { PalettedBlockStateStorage } from '../PalettedBlockStateStorage'

export class BiomeSection {
  biomes = new Uint16Array(16 ** 3)
  palette = []
  y = 0

  constructor (y) {
    this.y = y
  }

  readLegacy2D (stream: Stream) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        this.setBiome(x, 15, z, stream.readByte())
      }
    }
  }

  copy (other: BiomeSection) {
    this.biomes = new Uint16Array(other.biomes)
    this.palette = JSON.parse(JSON.stringify(other.palette))
  }

  read (type: StorageType, buf: Stream, previousSection?: BiomeSection) {
    const paletteType = buf.readByte()
    // below should always be 1, so we use IDs
    // const usingNetworkRuntimeIds = paletteType & 1
    const bitsPerBlock = paletteType >> 1

    if (bitsPerBlock === 0) {
      this.biomes.fill(0)
      this.palette.push(buf.readLInt())
      return // short circuit
    }

    const bsc = new PalettedBlockStateStorage(bitsPerBlock)
    bsc.read(buf)
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 16; y++) {
          const biome = bsc.getBlockStateAt(x, y, z)
          this.biomes[((x << 8) | (z << 4) | y)] = biome
        }
      }
    }
    // now read palette
    this.palette = []
    if (type === StorageType.NetworkPersistence) {
      // Shift 1 bit to un-zigzag (we cannot be negative)
      // ask mojang why these are signed at all...
      const biomePaletteLength = buf.readUnsignedVarInt() >> 1
      for (let i = 0; i < biomePaletteLength; i++) {
        this.palette.push(buf.readUnsignedVarInt() >> 1)
      }
    } else {
      const biomePaletteLength = buf.readLInt()
      for (let i = 0; i < biomePaletteLength; i++) {
        this.palette.push(buf.readLInt())
      }
    }
  }

  setBiome (x, y, z, biomeId) {
    if (!this.palette.includes(biomeId)) {
      this.palette.push(biomeId)
    }

    this.biomes[((x << 8) | (z << 4) | y)] = this.palette.indexOf(biomeId)
  }

  getBiome (x, y, z) {
    return this.palette[this.biomes[((x << 8) | (z << 4) | y)]]
  }

  export (type: StorageType, stream: Stream) {
    const bitsPerBlock: byte = Math.ceil(Math.log2(this.palette.length)) || 1
    stream.writeByte(bitsPerBlock | 1)
    const bsc = new PalettedBlockStateStorage(bitsPerBlock)
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 16; y++) {
          const biome = this.biomes[((x << 8) | (z << 4) | y)]
          bsc.setBlockStateAt(x, y, z, biome)
        }
      }
    }
    bsc.write(stream)
    if (type === StorageType.NetworkPersistence) {
      stream.writeUnsignedVarInt(this.palette.length << 1)
      for (const biome of this.palette) {
        stream.writeUnsignedVarInt(biome << 1)
      }
    } else {
      stream.writeLInt(this.palette.length)
      for (const biome of this.palette) {
        stream.writeLInt(biome)
      }
    }
  }

  // Just write the top most layer biomes
  exportLegacy2D (stream: Stream) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const y = 15
        const biome = this.getBiome(x, y, z)
        stream.writeByte(biome)
      }
    }
  }
}
