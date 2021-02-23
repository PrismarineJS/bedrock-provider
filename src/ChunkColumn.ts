
/// <reference path="./global.d.ts" />
import { Version } from "./format";
import { BlockFactory } from  './BlockFactory'
import { Block } from "prismarine-block";
import { SubChunk } from './SubChunk'
import nbt, { NBT } from "prismarine-nbt";
import { Stream } from './Stream'
import { trace } from "console";

const MIN_Y = 0
const MAX_Y = 15

export class ChunkColumn {
  x: number; z: number
  version: number
  sections: SubChunk[]
  sectionsLen: number

  entities: NBT[]
  tiles: NBT[]

  biomes?: Uint8Array
  heights?: Uint16Array

  // For a new version we can change this
  minY = MIN_Y
  maxY = MAX_Y

  constructor(version: Version, x, z) {
    this.version = version
    this.x = x
    this.z = z
    this.sections = []
    this.entities = []
    this.tiles = []
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
    return sec.setBlock(sx, sy & 0xf, sz, block)
  }

  addSection(section: SubChunk) {
    this.sections.push(section)
    this.sectionsLen++
  }

  getSection(y) {
    return this.sections[this.minY + y]
  }

  addEntity() {

  }

  getSections(): SubChunk[] {
    return this.sections
  }

  getEntities() {

  }

  getBlockEntities() {

  }

  /**
   * Encodes this chunk column for the network
   * @param full Include block entities and biomes
   */
  async networkEncode(full = false): Promise<Buffer> {
    if (full) {
      const tileBufs = []
      for (const tile of this.tiles) {
        tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
      }
      const biomeBuf = this.biomes.length ? Buffer.from(this.biomes) : Buffer.allocUnsafe(256)
      const sectionBufs = []
      for (const section of this.sections) {
        sectionBufs.push(section.networkEncode(this.version))
      }
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
      this.tiles.push(parsed)
    }
  }
}