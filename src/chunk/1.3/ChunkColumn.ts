import { Block } from 'prismarine-block'
import nbt, { NBT } from 'prismarine-nbt'
import subchunk from './SubChunk'
import { getChecksum } from '../../cache/hash'
import { StorageType, Vec4 } from '../Chunk'
import { BlobEntry, BlobStore, BlobType, CCHash } from '../../cache/blobs'
import { Stream } from '../../Stream'
import v8 from 'v8'
import { minecraftVersionToChunkVersion, Version } from '../../versions'
import { BiomeSection } from './BiomeSection'
import PrismarineBiome from 'prismarine-biome'

export = function (version: string, mcData) {
  const defaultChunkVersion = minecraftVersionToChunkVersion(version)
  const SubChunk = subchunk(version, defaultChunkVersion >= Version.v1_17_30 ? 9 : 8)
  type SubChunk = InstanceType<typeof SubChunk>
  const Biome = PrismarineBiome(version)
  return class ChunkColumn {
    x: number; z: number
    chunkVersion: number
    sections: SubChunk[] = []
    sectionsLen = 0

    entities: NBT[] = []
    tiles: { string?: NBT } = {}

    biomes: BiomeSection[] = []
    heights?: Uint16Array

    // For a new version we can change this
    minY: number
    maxY: number
    // Chunk start offset
    co: number

    biomesUpdated = true
    biomesHash: Buffer | null

    constructor (x: number, z: number, chunkVersion?: number) {
      this.x = x
      this.z = z

      this.chunkVersion = chunkVersion || defaultChunkVersion
      if (this.chunkVersion >= Version.v1_17_30) {
        this.minY = -4
        this.maxY = 20
      } else {
        this.minY = 0
        this.maxY = 15
      }

      this.co = Math.abs(this.minY)
    }

    getBlock (vec4: Vec4): Block {
      const Y = vec4.y >> 4
      const sec = this.sections[this.co + Y]
      return sec.getBlock(vec4.l, vec4.x, vec4.y & 0xf, vec4.z)
    }

    setBlock (vec4: Vec4, block: Block) {
      const cy = vec4.y >> 4
      if (cy < this.minY || cy > this.maxY) return
      let sec = this.sections[this.co + cy]
      while (!sec) {
        this.addSection(SubChunk.create(this.sections.length))
        sec = this.sections[this.co + cy]
      }
      return sec.setBlock(vec4.l, vec4.x, vec4.y & 0xf, vec4.z, block)
    }

    getBlockStateId (pos) {
      return this.getBlock(pos)?.stateId
    }

    setBlockStateId (pos, runtimeId: number) {
      const cy = pos.y >> 4
      return this.getSection(cy).setBlockStateId(pos.l, pos.x, pos.y, pos.z, runtimeId)
    }

    getSection (y: int) {
      return this.sections[this.co + y]
    }

    setSection (y: number, section: SubChunk) {
      this.sections[this.co + y] = section
    }

    addSection (section) {
      if (!this.getSection(section.y)) {
        this.sectionsLen++
      }
      this.setSection(section.y, section)
    }

    newSection (y: int) {
      const n = new SubChunk(y)
      if (!this.getSection(y)) {
        this.sectionsLen++
      }
      this.setSection(y, n)
      return n
    }

    getBlocks () {
      const blocks = []
      for (const section of this.sections) {
        blocks.push(section.getBlocks())
      }

      const deduped = {}
      for (const block of blocks) {
        deduped[block.globalIndex] = block
      }
      return Object.values(deduped)
    }

    addEntity (nbt) {
      this.entities.push(nbt)
    }

    addBlockEntity (nbt) {
      // console.log('[wp] adding tile', nbt)
      const x = nbt.value.x.value
      const y = nbt.value.y.value
      const z = nbt.value.z.value
      this.tiles[`${x},${y},${z}`] = nbt
    }

    removeBlockEntity (x, y, z) {
      delete this.tiles[`${x},${y},${z}`]
    }

    moveBlockEntity (x, y, z, x2, y2, z2) {
      const key = `${x},${y},${z}`
      const nbt = this.tiles[key]
      if (!nbt) return
      delete this.tiles[key]
      this.tiles[`${x2},${y2},${z2}`] = nbt
    }

    getSectionBlockEntities (y: number) {
      const tiles = []
      for (const id in this.tiles) {
        const tile = this.tiles[id]
        if ((tile.value.y.value >> 4) === y) {
          tiles.push(tile)
        }
      }
      return tiles
    }

    getSections (): SubChunk[] {
      return this.sections
    }

    getEntities () {
      return this.entities
    }

    getBlockEntities () {
      return this.tiles
    }

    getBiome ({ x, y, z }) {
      const Y = y >> 4
      const sec = this.biomes[this.co + Y]
      return new Biome(sec.getBiome(x, y & 0xf, z))
    }

    setBiome ({ x, y, z }, biome) {
      const cy = y >> 4
      if (cy < this.minY || cy > this.maxY) return
      let sec = this.biomes[this.co + cy]
      this.biomesUpdated = true
      while (!sec) {
        this.biomes.push(new BiomeSection(this.co + this.sections.length))
        sec = this.biomes[this.co + cy]
      }
      return sec.setBiome(x, y & 0xf, z, biome)
    }

    // Load 3D biome data from disk
    loadBiomes (buf: Stream, storageType: StorageType) {
      let last
      for (let y = this.minY; buf.peek(); y++) {
        if (buf.peek() === 0xff) { // re-use the last data
          if (!last) throw new Error('No last biome')
          const biome = new BiomeSection(y)
          biome.copy(last)
          this.biomes.push(biome)
          // skip
          buf.readByte()
        } else {
          const biome = new BiomeSection(y)
          biome.read(storageType, buf)
          last = biome
          this.biomes.push(biome)
        }
      }
    }

    loadLegacyBiomes (buf: Stream) {
      const biome = new BiomeSection(0)
      biome.readLegacy2D(buf)
      this.biomes = [biome]
    }

    // Load heightmap data
    loadHeights (heightmap: Uint16Array) {
      this.heights = heightmap
    }

    getHeights () {
      return this.heights
    }

    async updateBiomeHash (fromBuf: Buffer | Uint8Array): Promise<Buffer> {
      this.biomesUpdated = false
      this.biomesHash = await getChecksum(fromBuf)
      return this.biomesHash
    }

    // #region -- Encoding --

    /**
     * Encodes this chunk column for the network with no caching
     * @param buffer Full chunk buffer
     */
    async networkEncodeNoCache (): Promise<Buffer> {
      const tileBufs = []
      for (const key in this.tiles) {
        const tile = this.tiles[key]
        tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
      }

      // TODO: Properly allocate the heightmap
      const heightmap = Buffer.alloc(512)
      let biomeBuf
      if (this.chunkVersion >= Version.v1_18_0) {
        const stream = new Stream()
        for (const biomeSection of this.biomes) {
          biomeSection.export(StorageType.NetworkPersistence, stream)
        }
        biomeBuf = stream.getBuffer()
      } else {
        const stream = new Stream()
        if (this.biomes[0]) {
          this.biomes[0].exportLegacy2D(stream)
          biomeBuf = stream.getBuffer()
        } else {
          biomeBuf = Buffer.alloc(256)
        }
      }

      const sectionBufs = []
      for (const section of this.sections) {
        sectionBufs.push(await section.encode(StorageType.Runtime))
      }
      return Buffer.concat([
        ...sectionBufs,
        // heightmap, // Looks like this is not written?
        biomeBuf,
        Buffer.from([0]), // border blocks count
        ...tileBufs // block entities
      ])
    }

    /**
     * Encodes this chunk column for use over network with caching enabled
     *
     * @param blobStore The blob store to write chunks in this section to
     * @returns {Promise<Buffer[]>} The blob hashes for this chunk, the last one is biomes, rest are sections
     */
    async networkEncodeBlobs (blobStore: BlobStore): Promise<CCHash[]> {
      const blobHashes = [] as CCHash[]
      for (const section of this.sections) {
        // const key = `${this.x},${section.y},${this.z}`
        if (section.updated || !blobStore.read(section.hash)) {
          const buffer = await section.encode(StorageType.NetworkPersistence, true)
          const blob = new BlobEntry({ x: this.x, y: section.y, z: this.z, type: BlobType.ChunkSection, buffer })
          blobStore.write(section.hash, blob)
        }
        blobHashes.push({ hash: section.hash, type: BlobType.ChunkSection })
      }
      if (this.biomesUpdated || !this.biomesHash || !blobStore.read(this.biomesHash)) {
        if (this.chunkVersion >= Version.v1_18_0) {
          const stream = new Stream()
          for (const biomeSection of this.biomes) {
            biomeSection.export(StorageType.NetworkPersistence, stream)
          }
          const biomeBuf = stream.getBuffer()
          await this.updateBiomeHash(biomeBuf)
        } else {
          if (this.biomes[0]) {
            const stream = new Stream()
            this.biomes[0].exportLegacy2D(stream)
            await this.updateBiomeHash(stream.getBuffer())
          } else {
            await this.updateBiomeHash(Buffer.alloc(256))
          }
        }

        this.biomesUpdated = false
        blobStore.write(this.biomesHash, new BlobEntry({ x: this.x, z: this.z, type: BlobType.Biomes, buffer: this.biomes }))
      }
      blobHashes.push({ hash: this.biomesHash, type: BlobType.Biomes })
      return blobHashes
    }

    async networkEncode (blobStore: BlobStore) {
      const blobs = await this.networkEncodeBlobs(blobStore)
      const tileBufs = []
      for (const key in this.tiles) {
        const tile = this.tiles[key]
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

    // #endregion

    // #region -- Decoding --

    // Pre-1.18 method
    async networkDecodeNoCache (buffer: Buffer, sectionCount: number) {
      const stream = new Stream(buffer)

      if (sectionCount === -1) { // In 1.18+, with sectionCount as -1 we only get the biomes here
        return this.loadBiomes(stream, StorageType.NetworkPersistence)
      }

      this.sections = []
      for (let i = 0; i < sectionCount; i++) {
        // in 1.17.30+, chunk index is sent in payload
        const section = new SubChunk(i)
        await section.decode(StorageType.Runtime, stream)
        this.sections.push(section)
      }

      if (this.chunkVersion >= Version.v1_18_0) {
        for (let i = 0; i < sectionCount; i++) {
          const section = this.sections[i]
          const biomeSection = new BiomeSection(section.y)
          biomeSection.read(StorageType.Runtime, stream)
          this.biomes.push(biomeSection)
        }
      } else {
        const biomes = new BiomeSection(0)
        biomes.readLegacy2D(stream)
        this.biomes = [biomes]
      }

      const borderBlocksLength = stream.readVarInt()
      const borderBlocks = stream.read(borderBlocksLength)
      // Don't know how to handle this yet
      if (borderBlocks.length) throw Error(`Read ${borderBlocksLength} border blocks, expected 0`)

      const buf = stream.getBuffer()
      buf.startOffset = stream.getOffset()
      while (stream.peek() === 0x0A) {
        const { parsed, metadata } = await nbt.parse(buf, 'littleVarint')
        stream.offset += metadata.size
        buf.startOffset += metadata.size
        this.addBlockEntity(parsed)
      }
    }

    /**
     * Decodes cached chunks sent over the network
     * @param blobs The blob hashes sent in the Chunk packet
     * @param blobStore Our blob store for cached data
     * @param {Buffer} payload The rest of the non-cached data
     * @returns {CCHash[]} A list of hashes we don't have and need. If len > 0, decode failed.
     */
    async networkDecode (blobs: CCHash[], blobStore: BlobStore, payload): Promise<CCHash[]> {
      const stream = new Stream(payload)
      const borderblocks = stream.read(stream.readByte())
      if (borderblocks.length) {
        throw new Error('cannot handle border blocks (read length: ' + borderblocks.length + ')')
      }

      payload.startOffset = stream.getOffset()
      while (stream.peek() === 0x0A) {
        const { parsed, metadata } = await nbt.parse(payload, 'littleVarint')
        stream.offset += metadata.size
        payload.startOffset += metadata.size
        this.addBlockEntity(parsed)
      }

      const misses = [] as CCHash[]
      for (const blob of blobs) {
        if (!blobStore.has(blob.hash)) {
          misses.push(blob)
        }
      }
      if (misses.length > 0) {
        // missing stuff, call this again once the server replies with our MISSing
        // blobs and don't try to load this column until we have all the data
        return misses
      }

      // Reset the sections & length, when we add a section, it will auto increment
      this.sections = []
      this.sectionsLen = 0
      for (const blob of blobs) {
        const entry = blobStore.read(blob.hash)
        if (entry.type === BlobType.Biomes) {
          this.biomes = entry.buffer
        } else if (entry.type === BlobType.ChunkSection) {
          const subchunk = new SubChunk(this.sectionsLen)
          await subchunk.decode(StorageType.NetworkPersistence, new Stream(entry.buffer))
          this.addSection(subchunk)
        } else {
          throw Error('Unknown blob type: ' + entry.type)
        }
      }

      return misses
    }

    // #endregion

    // #region 1.18 interface

    async networkDecodeSubChunkNoCache (y: int, buffer: Buffer) {
      const stream = new Stream(buffer)
      const section = new SubChunk(y)
      await section.decode(StorageType.Runtime, stream)
      this.setSection(y, section)

      const buf = stream.getBuffer()
      buf.startOffset = stream.getOffset()
      while (stream.peek() === 0x0A) {
        const { parsed, metadata } = await nbt.parse(buf, 'littleVarint')
        stream.offset += metadata.size
        buf.startOffset += metadata.size
        this.addBlockEntity(parsed)
      }
    }

    async networkEncodeSubChunkNoCache (y) {
      const tiles = this.getSectionBlockEntities(y)

      const section = this.getSection(y)
      const subchunk = await section.encode(StorageType.Runtime)

      const tileBufs = []
      for (const tile of tiles) {
        tileBufs.push(nbt.writeUncompressed(tile, 'littleVarint'))
      }

      return Buffer.concat([subchunk, ...tileBufs])
    }

    // #endregion

    /* Serialization */
    serialize () {
      if (typeof v8 === 'undefined') {
        throw Error('String serialization not yet supported')
      } else {
        const copy = { ...this, sections: [] }
        for (const section of this.sections) {
          const sec = { ...section }
          copy.sections.push(v8.serialize(sec))
        }
        return v8.serialize(copy)
      }
    }

    toJson () { return this.serialize() }

    static deserialize (obj) {
      if (typeof obj === 'string') {
        // Oject.assign(this, JSON.parse(obj))
        throw Error('String serialization not yet supported')
      } else { // Buffer
        const des = v8.deserialize(obj)
        // @ts-expect-error : we don't do anything special in the constructor, Object.assign should work
        const chunk = new ChunkColumn()
        Object.assign(chunk, des)
        chunk.sections = []
        for (const section of des.sections) {
          // @ts-expect-error : same for above
          const s = new SubChunk(chunk.factory)
          chunk.sections.push(Object.assign(s, v8.deserialize(section)))
        }
        return chunk
      }
    }

    static fromJson (obj) {
      return ChunkColumn.deserialize(obj)
    }
  }
}
