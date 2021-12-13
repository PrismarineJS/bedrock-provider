import type { LevelDB } from 'leveldb-zlib'
import NBT from 'prismarine-nbt'
import { Stream } from '../Stream'
import { getChunkWrapper } from './chunkLoader'
import { KeyBuilder, KeyData, recurseMinecraftKeys } from './databaseKeys'
import { IChunkColumn, StorageType } from '../chunk/Chunk'
import { Version } from '../versions'

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

  private readonly readNewVersion = async (x, z) => await this.get(KeyBuilder.buildVersionKey(x, z, this.dimension))
  private readonly readOldVersion = async (x, z) => await this.get(KeyBuilder.buildLegacyVersionKey(x, z, this.dimension))

  async getChunkVersion (x, z): Promise<byte> {
    const version = await this.readNewVersion(x, z) || await this.readOldVersion(x, z)
    return version ? version[0] : null
  }

  hasChunk = async (x, z) => !!await this.getChunkVersion(x, z)

  async readSubChunks (x, z, version?) {
    const ver = version || await this.getChunkVersion(x, z)
    const ChunkColumn = getChunkWrapper(ver, 0)
    if (ChunkColumn) {
      const cc = new ChunkColumn(x, z, ver)
      const minY = ver >= Version.v1_17_30 ? cc.minY : 0
      for (let y = minY; y < cc.maxY; y++) {
        const chunk = await this.get(KeyBuilder.buildChunkKey(x, y, z, this.dimension))
        if (!chunk) break
        const subchunk = cc.newSection(y)
        await subchunk.decode(StorageType.LocalPersistence, new Stream(chunk))
      }
      return cc
    }
    return null
  }

  async readEntities (x, z, version): Promise<NBT.NBT[]> {
    const ver = version || await this.getChunkVersion(x, z)
    const ret = []
    if (ver >= Version.v0_17_0) {
      const key = KeyBuilder.buildEntityKey(x, z, this.dimension)
      const buffer = await this.get(key) as Buffer & { startOffset }

      if (buffer) {
        buffer.startOffset = 0
        while (buffer[buffer.startOffset] === 0x0A) {
          const { parsed, metadata } = await NBT.parse(buffer, 'little')

          buffer.startOffset += metadata.size
          ret.push(parsed)
        }
      }
    }
    return ret
  }

  async readBlockEntities (x, z, version): Promise<NBT.NBT[]> {
    const ver = version || await this.getChunkVersion(x, z)
    const ret = []
    if (ver >= Version.v0_17_0) {
      const key = KeyBuilder.buildBlockEntityKey(x, z, this.dimension)
      const buffer = await this.get(key) as Buffer & { startOffset }

      if (buffer) {
        buffer.startOffset = 0
        while (buffer[buffer.startOffset] === 0x0A) {
          const { parsed, metadata } = await NBT.parse(buffer, 'little')

          buffer.startOffset += metadata.size
          ret.push(parsed)
        }
      }
    }
    return ret
  }

  async readBiomesAndElevation (x, z, version): Promise<{ heightmap: Buffer, biomes2d?: Buffer, biomes3d?: Buffer } | null> {
    const data2d = await this.get(KeyBuilder.buildHeightmapAndBiomeKey(x, z, this.dimension))

    if (data2d) {
      // TODO: When did this change from 256 -> 512?
      const heightmap = data2d.slice(0, 512)
      // TODO: this will most likely change in 1.17
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

  async readBorderBlocks (x, z, version) {
    const ver = version || await this.getChunkVersion(x, z)
    if (ver >= Version.v0_17_0) {
      const buffer = await this.get(KeyBuilder.buildBorderBlocksKey(x, z, this.dimension))
      return buffer
    }
    return null
  }

  async writeSubChunks (column: IChunkColumn): Promise<any> {
    const promises = []
    if (column.chunkVersion >= Version.v0_17_0) {
      for (let y = column.minY; y < column.maxY; y++) {
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

  writeEntities (column: IChunkColumn) {

  }

  /**
   * Loads a full chunk column
   * @param x position of chunk
   * @param z position of chunk
   * @param full include entities, tiles, height map and biomes
   */
  async load (x: number, z: number, full: boolean) {
    const cver = await this.getChunkVersion(x, z)

    if (cver) {
      const column = await this.readSubChunks(x, z, cver)
      if (full) {
        const tiles = await this.readBlockEntities(x, z, cver)
        column.entities = await this.readEntities(x, z, cver)
        tiles.forEach(tile => column.addBlockEntity(tile))
        const data = await this.readBiomesAndElevation(x, z, cver)

        column.loadHeights(new Uint16Array(data.heightmap))
        if (data.biomes2d) {
          column.loadLegacyBiomes(new Stream(data.biomes2d))
        } else if (data.biomes3d) {
          column.loadBiomes(new Stream(data.biomes3d))
        }
      }

      return column
    }
  }

  async getChunk (x: number, z: number, full: boolean = true) {
    return await this.load(x, z, full)
  }

  async save (column: IChunkColumn) {
    return await this.writeSubChunks(column)
  }

  async getKeys (): Promise<KeyData[]> {
    return await recurseMinecraftKeys(this.db)
  }
}
