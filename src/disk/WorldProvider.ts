import type { LevelDB } from 'leveldb-zlib'
import { KeyBuilder, KeyData, recurseMinecraftKeys } from './databaseKeys'
import { Version, chunkVersionToMinecraftVersion } from '../versions'
import getChunk from '../chunk/loader'
import { StorageType, BedrockChunk } from 'prismarine-chunk'
import Stream from 'prismarine-chunk/src/bedrock/common/Stream'

export class WorldProvider {
  db: LevelDB
  dimension: number
  version: string

  /**
   * Creates a new Bedrock world provider
   * @param db a LevelDB instance for this save file
   * @param options dimension - 0 for overworld, 1 for nether, 2 for end
   *                version - The version to load the world as.
   */
  constructor (db: LevelDB, options?: { dimension: number, version?}) {
    this.db = db
    if (!this.db.isOpen()) {
      this.db.open()
    }
    this.dimension = options.dimension || 0
    this.version = options.version
  }

  private async get (key): Promise<Buffer | null> {
    try { return await this.db.get(key) } catch (e) { return null }
  }

  async getChunkVersion (x, z): Promise<byte> {
    const version = (await this.get(KeyBuilder.buildVersionKey(x, z, this.dimension))) ||
      await this.get(KeyBuilder.buildLegacyVersionKey(x, z, this.dimension))
    return version ? version[0] : null
  }

  async readSubChunks (chunkVersion: number, x: int, z: int) {
    const mcVer = chunkVersionToMinecraftVersion(chunkVersion)
    const ChunkColumn = getChunk(mcVer)

    if (ChunkColumn) {
      const cc = new ChunkColumn({ x, z, chunkVersion })
      for (let y = cc.minCY; y < cc.maxCY; y++) {
        const chunk = await this.get(KeyBuilder.buildChunkKey(x, y, z, this.dimension))
        // console.log('Read chunk', x, y, z, chunk)
        if (!chunk) break
        await cc.newSection(y, StorageType.LocalPersistence as int, chunk)
      }
      return cc
    }

    return null
  }

  async readEntities (chunkVersion: number, x: number, z: number): Promise<Buffer> {
    if (chunkVersion >= Version.v0_17_0) {
      const key = KeyBuilder.buildEntityKey(x, z, this.dimension)
      const buffer = await this.get(key)
      return buffer
    }
  }

  async readBlockEntities (chunkVersion: number, x: number, z: number): Promise<Buffer> {
    if (chunkVersion >= Version.v0_17_0) {
      const key = KeyBuilder.buildBlockEntityKey(x, z, this.dimension)
      const buffer = await this.get(key)
      return buffer
    }
  }

  async readBiomesAndElevation (chunkVersion: number, x: number, z: number): Promise<{ heightmap: Buffer, biomes2d?: Buffer, biomes3d?: Buffer } | null> {
    const data2d = await this.get(KeyBuilder.buildHeightmapAndBiomeKey(x, z, this.dimension))

    if (data2d) {
      // TODO: When did this change from 256 -> 512?
      const heightmap = data2d.slice(0, 512)
      const biomes2d = data2d.slice(512, 512 + 256)
      return { heightmap, biomes2d }
    } else {
      const data3d = await this.get(KeyBuilder.buildHeightmapAnd3DBiomeKey(x, z, this.dimension))
      if (data3d) {
        const heightmap = data3d.slice(0, 512)
        const biomes3d = data3d.slice(512)
        return { heightmap, biomes3d }
      }
    }

    return null
  }

  async writeSubChunks (column: BedrockChunk): Promise<any> {
    const promises = []
    if (column.chunkVersion >= Version.v1_17_0) {
      for (let y = column.minCY; y < column.maxCY; y++) {
        const section = column.getSection(y)
        if (!section) {
          break // no more sections
        }
        const key = KeyBuilder.buildChunkKey(column.x, y, column.z, this.dimension)
        const buf = await section.encode(StorageType.LocalPersistence)
        promises.push(this.db.put(key, buf))
      }
    }

    return await Promise.all(promises)
  }

  async writeEntities (column: BedrockChunk) {
    const key = KeyBuilder.buildEntityKey(column.x, column.z, this.dimension)
    const buffer = column.diskEncodeEntities()
    await this.db.put(key, buffer)
  }

  async writeBlockEntities (column: BedrockChunk) {
    const key = KeyBuilder.buildBlockEntityKey(column.x, column.z, this.dimension)
    const buffer = column.diskEncodeBlockEntities()
    await this.db.put(key, buffer)
  }

  async writeBiomesAndElevation (cc: BedrockChunk) {
    if (cc.chunkVersion >= Version.v1_18_0) {
      const key = KeyBuilder.buildHeightmapAnd3DBiomeKey(cc.x, cc.z, this.dimension)
      const stream = new Stream()
      cc.writeHeightMap(stream)
      cc.writeBiomes(stream)
      await this.db.put(key, stream.getBuffer())
    } else if (cc.chunkVersion < Version.v1_18_0) {
      const key = KeyBuilder.buildHeightmapAndBiomeKey(cc.x, cc.z, this.dimension)
      const stream = new Stream()
      cc.writeHeightMap(stream)
      cc.writeLegacyBiomes(stream)
      await this.db.put(key, stream.getBuffer())
    }
  }

  async readBorderBlocks (chunkVersion: number, x: number, z: number): Promise<Buffer> {
    if (chunkVersion >= Version.v0_17_0) {
      const buffer = await this.get(KeyBuilder.buildBorderBlocksKey(x, z, this.dimension))
      return buffer
    }
    return null
  }

  /**
   * Loads a full chunk column
   * @param x position of chunk
   * @param z position of chunk
   * @param full include entities, tiles, height map and biomes
   */
  async load (x: number, z: number, full: boolean = true) {
    const cver = await this.getChunkVersion(x, z)

    if (cver) {
      const column = await this.readSubChunks(cver, x, z)
      if (full) {
        column.diskDecodeEntities(await this.readEntities(cver, x, z))
        column.diskDecodeBlockEntities(await this.readBlockEntities(cver, x, z))
        const data = await this.readBiomesAndElevation(x, z, cver)
        if (data) {
          if (data.heightmap) column.loadHeights(new Uint16Array(data.heightmap))
          if (data.biomes2d) {
            column.loadLegacyBiomes(data.biomes2d)
          } else if (data.biomes3d) {
            column.loadBiomes(data.biomes3d, StorageType.LocalPersistence as number)
          }
        }
      }

      return column
    }
  }

  async save (x: number, z: number, column: BedrockChunk) {
    const verKey = KeyBuilder.buildVersionKey(x, z, this.dimension)
    await this.db.put(verKey, Buffer.from([column.chunkVersion]))
    await this.writeSubChunks(column)
    await this.writeEntities(column)
    await this.writeBiomesAndElevation(column)
  }

  async getChunk (x: number, z: number, full = true): Promise<BedrockChunk> {
    return await this.load(x, z, full)
  }

  async getKeys (): Promise<KeyData[]> {
    return await recurseMinecraftKeys(this.db)
  }
}
