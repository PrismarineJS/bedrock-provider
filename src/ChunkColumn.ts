
/// <reference path="./global.d.ts" />
import { Version, getChecksum } from "./format";
import { BlockFactory, blockFactory } from './BlockFactory'
import { Block } from "prismarine-block";
import { StorageType, SubChunk } from './SubChunk'
import nbt, { NBT } from "prismarine-nbt";
import { Stream } from './Stream'
import { BlobEntry, BlobStore, BlobType } from "./Blob";

const MIN_Y = 0
const MAX_Y = 15

export class ChunkColumn {
  x: number; z: number
  version: number
  sections: SubChunk[] = []
  sectionsLen = 0

  entities: NBT[] = []
  tiles: { string?: NBT } = {}

  biomes?: Uint8Array
  heights?: Uint16Array

  // For a new version we can change this
  minY = MIN_Y
  maxY = MAX_Y

  biomesUpdated = true
  biomesHash: Buffer | null

  factory: BlockFactory = blockFactory

  constructor(colVersion: Version, x: number, z: number) {
    this.version = colVersion
    this.x = x
    this.z = z
  }

  getBlock({ x, y, z }): Block {
    let Y = y >> 4
    let sec = this.sections[this.minY + Y]
    if (sec) return sec.getBlock(x, y & 0xf, z)
    return this.factory.getPBlockFromStateID(0)
  }

  setBlock({ x, y, z }, block: Block) {
    let Y = y >> 4
    if (Y < this.minY || Y > this.maxY) return
    let sec = this.sections[this.minY + Y]
    while (!sec) {
      this.addSection(new SubChunk(this.factory, this.version, this.sections.length))
      sec = this.sections[this.minY + Y]
    }
    return sec.setBlock(x, y & 0xf, z, block)
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

  getBiome({ x, y, z }) {
    //todo
  }

  setBiome({ x, y, z }, biome) {
    this.biomesUpdated = true
  }

  async updateHash(fromBuf: Buffer | Uint8Array): Promise<Buffer> {
    this.biomesUpdated = false
    this.biomesHash = await getChecksum(fromBuf)
    return this.biomesHash
  }

  /**
   * Encodes this chunk column for the network with no caching
   * @param buffer Full chunk buffer
   */
  async networkEncodeNoCache(): Promise<Buffer> {
    const tileBufs = []
    for (const key in this.tiles) {
      const tile = this.tiles[key]
      tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
    }
    const biomeBuf = this.biomes?.length ? Buffer.from(this.biomes) : Buffer.alloc(256)
    const sectionBufs = []
    for (const section of this.sections) {
      sectionBufs.push(await section.encode(this.version, StorageType.Runtime))
    }
    return Buffer.concat([
      ...sectionBufs,
      biomeBuf,
      Buffer.from([0]), // border blocks
      ...tileBufs
    ])
  }

  /**
   * Encodes this chunk column for use over network with caching enabled
   * 
   * @param blobStore The blob store to write chunks in this section to
   * @returns {Promise<Buffer[]>} The blob hashes for this chunk, the last one is biomes, rest are sections
   */
  async networkEncodeBlobs(blobStore: BlobStore): Promise<CCHash[]> {
    const blobHashes = [] as CCHash[]
    for (const section of this.sections) {
      const key = `${this.x},${section.y},${this.z}`
      if (section.updated || !blobStore.read(section.hash)) {
        const buffer = await section.encode(this.version, StorageType.NetworkPersistence)
        const blob = new BlobEntry({ x: this.x, y: section.y, z: this.z, type: BlobType.ChunkSection, buffer })
        blobStore.write(section.hash, blob)
        // console.log('WROTE BLOB', blob)
      }
      blobHashes.push({ hash: section.hash, type: BlobType.ChunkSection })
    }
    if (this.biomesUpdated || !this.biomesHash || !blobStore.read(this.biomesHash)) {
      if (!this.biomes) this.biomes = new Uint8Array(256)
      await this.updateHash(this.biomes)
      this.biomesUpdated = false
      blobStore.write(this.biomesHash, new BlobEntry({ x: this.x, z: this.z, type: BlobType.Biomes, buffer: this.biomes }))
    }
    blobHashes.push({ hash: this.biomesHash, type: BlobType.Biomes })
    return blobHashes
  }

  async networkEncode(blobStore: BlobStore) {
    const blobs = await this.networkEncodeBlobs(blobStore)
    const tileBufs = []
    for (const key in this.tiles) {
      const tile = this.tiles[key]
      // console.log(JSON.stringify(tile))
      tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
    }

    return {
      blobs, // cache blobs
      payload: Buffer.concat([ // non-cached stuff
        Buffer.from([0]), // border blocks
        ...tileBufs
      ])
    }
  }

  async networkDecodeNoCache(buffer: Buffer, sectionCount: number) {
    const stream = new Stream(buffer)
    this.sections = []
    // console.warn('Total Reading', sectionCount)
    for (let i = 0; i < sectionCount; i++) {
      // console.warn('Reading', i)
      const section = new SubChunk(this.factory, this.version, i, false)
      await section.decode(StorageType.Runtime, stream)
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

  /**
   * Decodes cached chunks sent over the network
   * @param blobs The blob hashes sent in the Chunk packe
   * @param blobStore Our blob store for cached data
   * @param {Buffer} payload The rest of the non-cached data
   * @returns {CCHash[]} A list of hashes we don't have and need. If len > 0, decode failed.
   */
  async networkDecode(blobs: CCHash[], blobStore: BlobStore, payload): Promise<CCHash[]> {
    const stream = new Stream(payload)
    const borderblocks = stream.read(stream.readByte())
    if (borderblocks.length) console.debug('[wp] Skip ', borderblocks, 'bytes')

    payload.startOffset = stream.getOffset()
    while (stream.peek() == 0x0A) {
      const { parsed, metadata } = await nbt.parse(payload, 'littleVarint')
      stream.offset += metadata.size
      payload.startOffset += metadata.size
      this.addBlockEntity(parsed)
    }

    const misses = [] as CCHash[]
    for (const blob of blobs) {
      // console.log('Checking blob', blob, blobStore.get(blob.hash), blobStore)
      if (!blobStore.has(blob.hash)) {
        misses.push(blob)
      }
    }
    if (misses.length > 0) {
      // missing stuff, call this again once the server replies with our MISSing
      // blobs and don't try to load this column until we have all the data
      return misses
    }
    this.sections = []
    this.sectionsLen = 0
    for (const blob of blobs) {
      const entry = blobStore.read(blob.hash)
      // console.log('BUF',entry)
      if (entry.type == BlobType.Biomes) {
        this.biomes = entry.buffer
      } else if (entry.type == BlobType.ChunkSection) {
        const subchunk = new SubChunk(this.factory, this.version, this.sectionsLen)
        await subchunk.decode(StorageType.NetworkPersistence, new Stream(entry.buffer))
        this.addSection(subchunk)
      } else {
        throw Error(`Unknown blob type: ` + entry.type)
      }
    }

    return misses
  }
}

type CCHash = { type: BlobType, hash: Buffer }