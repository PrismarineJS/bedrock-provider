import { LevelDB } from 'leveldb-zlib'
import { KeyBuilder, Version, KeyData, recurseMinecraftKeys } from './format'
import { ChunkColumn } from './ChunkColumn'
import { StorageType, SubChunk } from './SubChunk'
import NBT from 'prismarine-nbt'
import { Stream } from './Stream'

export class WorldProvider {
  db: LevelDB
  dimension: number

  constructor(db: LevelDB, options?: { dimension: number }) {
    this.db = db
    if (!this.db.isOpen()) {
      this.db.open()
    }
    this.dimension = options.dimension || 0
  }

  private async get(key): Promise<Buffer | null> {
    // @ts-ignore
    try { return await this.db.get(key) }
    catch (e) { return null }
    // catch (e) { throw new Error('Database get error ' + e.stack) }
  }

  private readNewVersion = async (x, z) => await this.get(KeyBuilder.buildVersionKey(x, z, this.dimension))
  private readOldVersion = async (x, z) => await this.get(KeyBuilder.buildLegacyVersionKey(x, z, this.dimension))

  async getChunkVersion(x, z): Promise<byte> {
    let version = await this.readNewVersion(x, z) || await this.readOldVersion(x, z)
    // console.log('v', version)
    return version ? version[0] : null
  }

  hasChunk = async (x, z) => await this.getChunkVersion(x, z) ? true : false

  async readSubChunks(x, z, version?) {
    let ver = version || await this.getChunkVersion(x, z)
    if (ver >= Version.v17_0) {
      let cc = new ChunkColumn(ver, x, z)
      // TODO: Load height based on version
      for (let y = cc.minY; y < cc.maxY; y++) {
        let chunk = await this.get(KeyBuilder.buildChunkKey(x, y, z, this.dimension))
        if (!chunk) break
        const subchunk = new SubChunk(version, y, false)
        await subchunk.decode(StorageType.LocalPersistence, new Stream(chunk))
        cc.addSection(subchunk)
        // console.log('Raw chunk', chunk.toString('hex'))
      }
      return cc
    }
    return null
  }

  async readEntities(x, z, version): Promise<NBT.NBT[]> {
    let ver = version || await this.getChunkVersion(x, z)
    const ret = []
    if (ver >= Version.v17_0) {
      let key = KeyBuilder.buildEntityKey(x, z, this.dimension)
      let buffer = await this.get(key) as Buffer & { startOffset }
      // console.log('Entities', key, buffer)

      if (buffer) {
        buffer.startOffset = 0
        while (buffer[buffer.startOffset] == 0x0A) {
          const { parsed, metadata } = await NBT.parse(buffer, 'little')

          buffer.startOffset += metadata.size
          ret.push(parsed)
          // console.log(buffer.startOffset, metadata.size, buffer.length)
        }
      }
    }
    // console.log('Entities', ret)
    return ret
  }

  async readBlockEntities(x, z, version): Promise<NBT.NBT[]> {
    let ver = version || await this.getChunkVersion(x, z)
    const ret = []
    if (ver >= Version.v17_0) {
      let key = KeyBuilder.buildBlockEntityKey(x, z, this.dimension)
      let buffer = await this.get(key) as Buffer & { startOffset }
      // console.log('Entities', key, buffer)

      if (buffer) {
        buffer.startOffset = 0
        while (buffer[buffer.startOffset] == 0x0A) {
          const { parsed, metadata } = await NBT.parse(buffer, 'little')

          buffer.startOffset += metadata.size
          ret.push(parsed)
          // console.log(buffer.startOffset, metadata.size, buffer.length)
        }
      }
    }
    // console.log('BlockEntities', ret)
    return ret
  }

  async readBiomesAndElevation(x, z, version): Promise<{ heightmap: Buffer, biomes2d: Buffer } | null> {
    let ver = version || await this.getChunkVersion(x, z)
    if (ver >= Version.v17_0) {
      const buffer = await this.get(KeyBuilder.buildHeightmapAndBiomeKey(x, z, this.dimension))
      if (buffer) {
        // TODO: When did this change from 256 -> 512?
        const heightmap = buffer.slice(0, 512)
        // TODO: this will most likely change in 1.17
        const biomes2d = buffer.slice(512, 512 + 256)
        // console.log('Buffer len', buffer.length)
        return { heightmap, biomes2d }
      }
    }
    return null
  }

  async readBorderBlocks(x, z, version) {
    let ver = version || await this.getChunkVersion(x, z)
    if (ver >= Version.v17_0) {
      const buffer = await this.get(KeyBuilder.buildBorderBlocksKey(x, z, this.dimension))
      return buffer
    }
    return null
  }

  async writeSubChunks(column: ChunkColumn): Promise<any> {
    let formatVer = column.version
    // let sections = column.getSections()
    let promises = []
    if (formatVer >= Version.v17_0) {
      for (let y = column.minY; y < column.maxY; y++) {
        let section = column.getSection(y)
        // console.log('Save', y, section)
        if (!section) {
          break // no more sections
        }
        // globalThis.ckeys.push('save:')
        let key = KeyBuilder.buildChunkKey(column.x, y, column.z, this.dimension)
        let buf = await section.encode(formatVer, StorageType.LocalPersistence)
        promises.push(this.db.put(key, buf))
      }
    }

    return Promise.all(promises)
  }

  writeEntities(column: ChunkColumn) {

  }

  /**
   * Loads a full chunk column
   * @param x position of chunk
   * @param z position of chunk
   * @param full include entities, tiles, height map and biomes
   */
  async load(x: number, z: number, full: boolean) {
    let cver = await this.getChunkVersion(x, z)
    // console.log('Chunk ver', cver)
    if (cver) {
      let column = await this.readSubChunks(x, z, cver)
      // console.log('Read chunk', column)

      if (full) {
        const tiles = await this.readBlockEntities(x, z, cver)
        column.entities = await this.readEntities(x, z, cver)
        tiles.forEach(tile => column.addBlockEntity(tile))
        const data2d = await this.readBiomesAndElevation(x, z, cver)
        column.biomes = new Uint8Array(data2d.biomes2d)
        column.heights = new Uint16Array(data2d.heightmap)
      }

      return column
    }
  }

  async save(column: ChunkColumn) {
    return this.writeSubChunks(column)
  }

  async getKeys(): Promise<KeyData[]> {
    return recurseMinecraftKeys(this.db)
  }
}