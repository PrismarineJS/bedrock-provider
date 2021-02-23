
/// <reference path="./global.d.ts" />
import { Version } from "./format";
import { BlockFactory } from './BlockFactory'
import { Block } from "prismarine-block";
import { SubChunk } from './SubChunk'
import nbt, { NBT } from "prismarine-nbt";
import { Stream } from './Stream'

const MIN_Y = 0
const MAX_Y = 15

export class ChunkColumn {
  x: number; z: number
  version: number
  sections: SubChunk[]
  sectionsLen: number

  entities: NBT[]
  tiles: { string?: NBT }

  biomes?: Uint8Array
  heights?: Uint16Array

  // For a new version we can change this
  minY = MIN_Y
  maxY = MAX_Y

  updated = false
  hash: Buffer | null

  constructor(version: Version, x, z) {
    this.version = version
    this.x = x
    this.z = z
    this.sections = []
    this.entities = []
    this.tiles = {}
    this.sectionsLen = 0
  }

  getBlock(sx: int, sy: int, sz: int): Block {
    let y = sy >> 4
    let sec = this.sections[this.minY + y]
    if (sec) return sec.getBlock(sx, sy & 0xf, sz)
    return BlockFactory.getPBlockFromStateID(0)
  }

  setBlock(sx: int, sy: int, sz: int, block: Block) {
    let y = sy >> 4
    if (y < this.minY || y >= this.maxY) return
    let sec = this.sections[this.minY + y]
    while (!sec) {
      this.addSection(new SubChunk(this.version))
      sec = this.sections[this.minY + y]
    }
    this.updated = true
    return sec.setBlock(sx, sy & 0xf, sz, block)
  }

  addSection(section: SubChunk) {
    this.sections.push(section)
    this.sectionsLen++
  }

  getSection(y) {
    return this.sections[this.minY + y]
  }

  addEntity(nbt) {
    this.entities.push(nbt)
  }

  addBlockEntity(nbt) {
    console.log('[wp] adding tile', nbt)
    const x = nbt.value.x.value
    const z = nbt.value.z.value
    this.tiles[x + ',' + z] = nbt
  }

  getSections(): SubChunk[] {
    return this.sections
  }

  getEntities() {
    return this.entities
  }

  getBlockEntities() {
    return this.tiles
  }

  getBiome(x, y, z) {
    //todo
  }

  setBiome(x, y, z, biome) {
    this.updated = true
  }

  updateHash(fromBuffer): Buffer {
    this.updated = false
    this.hash = Buffer.from([Math.random()])
    return this.hash
  }

  /**
   * Encodes this chunk column for the network
   * @param full Include block entities and biomes
   */
  async networkEncode(full = true): Promise<Buffer> {
    if (full) {
      const tileBufs = []
      for (const key in this.tiles) {
        const tile = this.tiles[key]
        tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
      }
      const biomeBuf = this.biomes.length ? Buffer.from(this.biomes) : Buffer.allocUnsafe(256)
      const sectionBufs = []
      for (const section of this.sections) {
        sectionBufs.push(section.networkEncode(this.version))
      }
      if (this.updated) this.updateHash(Buffer.concat([...sectionBufs, biomeBuf]))
      return Buffer.concat([
        ...sectionBufs,
        biomeBuf,
        Buffer.from([0]), // border blocks
        ...tileBufs
      ])
    } else {
      const sectionBufs = []
      for (const section of this.sections) {
        sectionBufs.push(section.networkEncode(this.version))
      }
      return Buffer.concat(sectionBufs)
    }
  }

  async networkDecode(buffer: Buffer, sectionCount: number) {
    const stream = new Stream(buffer)
    this.sections = []
    // console.warn('Total Reading', sectionCount)
    for (let i = 0; i < sectionCount; i++) {
      // console.warn('Reading', i)
      const section = new SubChunk(this.version)
      section.decode(stream, true)
      this.sections.push(section)
    }
    this.biomes = new Uint8Array(stream.read(256))
    const extra = stream.read(stream.readByte())
    if (extra.length) console.debug('[wp] Read ', extra, 'bytes')

    const buf = stream.getBuffer()
    buf.startOffset = stream.getOffset()
    while (stream.peek() == 0x0A) {
      const { parsed, metadata } = await nbt.parse(buf, 'littleVarint')
      stream.offset += metadata.size
      buf.startOffset += metadata.size
      this.addBlockEntity(parsed)
    }
  }
}