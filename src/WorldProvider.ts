import { LevelDB } from 'leveldb-zlib'
import BinaryStream from '@jsprismarine/jsbinaryutils'
import { KeyBuilder, Tag, Version } from './format'
import { ChunkColumn, SubChunk } from './ChunkColumn'

const SUBCHUNK_START_HEIGHT = 0
const SUBCHUNK_END_HEIGHT = 16

export type KeyData = {
  x?: number,
  z?: number,
  y?: number,
  dim?: number,
  type?: string,
  tagId?: number,
  keyLen?: number,
  valLen?: number,
  skey?: String,
  key?: Buffer
}

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

  // @ts-ignore
  private async get(key): Promise<Buffer | null> {
    try { return await this.db.get(key) } 
    catch (e) { return null }
    // catch (e) { throw new Error('Database get error ' + e.stack) }
  }

  private readNewVersion = async (x, z) => await this.get(KeyBuilder.buildVersionKey(x, z, this.dimension))
  private readOldVersion = async (x, z) => await this.get(KeyBuilder.buildLegacyVersionKey(x, z, this.dimension))

  async getChunkVersion(x, z): Promise<byte> {
    let version = await this.readNewVersion(x, z) || await this.readOldVersion(x, z)
    console.log('v',version)
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
        const subchunk = new SubChunk(version, chunk, y)
        subchunk.decode() // Note: we don't wait for it to finish decoding here
        cc.addSection(subchunk)
      }
      return cc
    }
    return null
  }

  async readEntities(x, z, version) {
    let ver = version || await this.getChunkVersion(x, z)
    if (ver >= Version.v17_0) {
      let key = KeyBuilder.buildEntityKey(x, z, this.dimension)
      // let entities = 
    }
  }

  async readBlockEntities(x, z, version) {
    let ver = version || await this.getChunkVersion(x, z)

  }

  // private encodeSubChunks(formatVer, column: ChunkColumn) {
  //   let bufs = []
  //   if (formatVer >= Version.v17_0) {
  //     for (let y = column.minY; y < column.maxY; y++) {
  //       let section = column.sections[y]
  //       bufs.push(section.encode(formatVer))
  //     }
  //   }
  //   return bufs
  // }
  
  private encodeEntities(entities) {
    // write
  }

  private encodeBlockEntities(column) {

  }

  writeSubChunks(column: ChunkColumn): Promise<any> {
    let formatVer = column.version
    // let sections = column.getSections()
    let promises = []
    if (formatVer >= Version.v17_0) {
      for (let y = column.minY; y < column.maxY; y++) {
        let section = column.getSection(y)
        console.log('Save', y, section)
        if (!section) {
          break // no more sections
        }
        globalThis.ckeys.push('save:')
        let key = KeyBuilder.buildChunkKey(column.x, y, column.z, this.dimension)
        let buf = section.encode(formatVer)
        promises.push(this.db.put(key, buf))
      }
    }

    return Promise.all(promises)
  }

  writeEntities(column: ChunkColumn) {

  }

  async load(x: number, z: number) {
    let cver = await this.getChunkVersion(x, z)
    console.log('Chunk ver', cver)
    if (cver) {
      let cdata = await this.readSubChunks(x, z, cver)
      console.log('Read chunk', cdata)
      return cdata
    }
  }

  async save(column: ChunkColumn) {
    return this.writeSubChunks(column)
  }

  async getKeys(): Promise<KeyData[]> {
    return WorldProvider.recurseMinecraftKeys(this.db)
  }

  static async recurseMinecraftKeys(db) {
    /* eslint-disable */
    function readKey(buffer: Buffer): KeyData[] {
      let offset = 0
      let read: KeyData[] = []

      let ksize = buffer.length
      // console.log(ksize)
      if (ksize >= 8) {
        let cx = buffer.readInt32LE(0)
        let cz = buffer.readInt32LE(4)
        let tagOver = buffer[8]
        let tagWithDim = buffer[12]

        let dim = 0

        let overworld = ksize == 9
        let otherDim = ksize == 13

        if (otherDim) {
          dim = buffer.readInt32LE(8)
        }

        // console.log('good', cx, cz, tagOver, tagWithDim, dim, overworld, otherDim)

        if (overworld && tagOver == Tag.VersionNew) {
          // Version 1.16.100+
          read.push({ x: cx, z: cz, dim: 0, tagId: tagOver, type: 'version', key: buffer })
        } else if (otherDim && tagWithDim == Tag.VersionNew) {
          // Version
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'version', key: buffer })
        } else if (ksize == 10 && tagOver == Tag.SubChunkPrefix) {
          // Overworld chunk with subchunk
          let cy = buffer.readInt8(1 + 8)
          read.push({ x: cx, z: cz, y: cy, dim: dim, tagId: tagOver, type: 'chunk', key: buffer })
        } else if (ksize == 14 && tagWithDim == Tag.SubChunkPrefix) {
          // let dim = buffer.readInt32LE(offset += 4)
          let cy = buffer.readInt8(1 + 8 + 4)
          read.push({ x: cx, z: cz, y: cy, dim: dim, tagId: tagWithDim, type: 'chunk', key: buffer })
        } else if (otherDim && tagWithDim == Tag.Data2D) {
          // biomes and elevation for other dimensions
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'data2d', key: buffer })
        } else if (overworld && tagOver == Tag.Data2D) {
          // biomes + elevation for overworld
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'data2d', key: buffer })
        } else if (otherDim && tagWithDim == Tag.Entity) {
          // enities for dim
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'entity', key: buffer })
        } else if (overworld && tagOver == Tag.Entity) {
          // entities for overworld
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'entity', key: buffer })
        } else if (otherDim && tagWithDim == Tag.BlockEntity) {
          // block entities for dim
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'blockentity', key: buffer })
        } else if (overworld && tagOver == Tag.BlockEntity) {
          // block entities for overworld
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'blockentity', key: buffer })
        } else if (overworld && tagOver == Tag.FinalizedState) {
          // finalized state overworld chunks
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'finalizedState', key: buffer })
        } else if (otherDim && tagWithDim == Tag.FinalizedState) {
          // finalized state for other dimensions
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'finalizedState', key: buffer })
        } else if (overworld && tagOver == Tag.VersionOld) {
          // version for pre 1.16.100
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'versionOld', key: buffer })
        } else if (otherDim && tagWithDim == Tag.VersionOld) {
          // version for pre 1.16.100
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'versionOld', key: buffer })
        } else if (otherDim && tagWithDim == Tag.HardCodedSpawnAreas) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'spawnarea', key: buffer })
        } else if (overworld && tagOver == Tag.HardCodedSpawnAreas) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'spawanarea', key: buffer })
        } else if (otherDim && tagWithDim == Tag.BiomeState) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'biomeState', key: buffer })
        } else if (overworld && tagOver == Tag.BiomeState) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'biomeState', key: buffer })
        } else if (overworld && tagOver == Tag.PendingTicks) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'pendingTick', key: buffer })
        } else if (otherDim && tagWithDim == Tag.PendingTicks) {
          read.push({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'pendingTick', key: buffer })
        }

        if (!read.length) {
          console.log(buffer.length, 'Failed', cx, cz, buffer[9], tagOver, tagWithDim, dim, overworld, otherDim)

          read.push({ x: cx, z: cz, tagId: -1, skey: String(buffer), type: `unknown / ${tagOver || ''}, ${tagWithDim || ''}`, key: buffer })
        }
      }
      let skey = String(buffer)
      if (skey.includes('VILLAGE')) {
        if (skey.includes('DWELLERS')) {
          read.push({ type: 'village-dwellers', skey: skey, key: buffer })
        } else if (skey.includes('INFO')) {
          read.push({ type: 'village-info', skey: skey, key: buffer })
        } else if (skey.includes('POI')) {
          read.push({ type: 'village-poi', skey: skey, key: buffer })
        } else if (skey.includes('PLAYERS')) {
          read.push({ type: 'village-players', skey: skey, key: buffer })
        }
      }

      if (!read.length) {
        read.push({ type: 'unknown', skey: String(buffer), key: buffer })
      }

      return read
    }

    if (!db || !db.isOpen()) {
      return []
    }

    const out = []

    const iter = db.getIterator({ values: true })
    let entry = null
    console.log('Iterator entries:')
    while (entry = await iter.next()) { // eslint-disable-line
      // console.log('[mc] readKey: ', entry, entry[0].length)
      const read = readKey(entry[0])
      out.push(read)
      // if (read.length) {
      //   console.log(JSON.stringify(read))
      // } else {
      //   // console.log('Extranenous: ', entry[1])
      // }
    }
    await iter.end()
    return out
  }
}

async function test() {

  const mcdata = require('minecraft-data')('1.16.1')
  const gravel = mcdata.blocksByName.gravel

  let db = new LevelDB('./mctestdb', { createIfMissing: false })
  await db.open()
  let wp = new WorldProvider(db, { dimension: 0 })
  let keys = await wp.getKeys()
  for (var _key of keys) {
    let key = _key[0]
    // console.log(key.type)
    if (key.type == 'version') {
      console.log('version', key.x, key.z, key.key)
      let cc = await wp.load(key.x, key.z)

      // for (var x = 0; x < 4; x++) {
      //   for (var y = 0; y < 4; y++) {
      //     for (var z = 0; z < 4; z++) {
      //       const block = cc.getBlock(x,y,z)
      //       console.log('Got block', block)
      //       cc.setBlock(x, y, z, gravel)
      //       const block2 = cc.getBlock(x,y,z)
      //       console.log('Got new block', block2)
      //     }
      //   }
      // }

      // await wp.save(cc)
      break
    }
  }
  console.log(globalThis.ckeys)
  // console.log('Keys', keys)
}

test()