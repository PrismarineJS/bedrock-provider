import BinaryStream from '@jsprismarine/jsbinaryutils'
import { LevelDB } from 'leveldb-zlib'
import NBT from 'prismarine-nbt'
import PChunk from 'prismarine-chunk'

const CHUNK_KEY = 60

export class AnvilProvider {
  db: LevelDB
  version: string

  constructor(db: LevelDB, version)
  constructor(path: string, version)
  constructor(dbOrPath, version) {
    this.version = version
    if (typeof dbOrPath == 'object') {
      this.db = dbOrPath
    } else if (typeof dbOrPath == 'string') {
      this.db = new LevelDB(dbOrPath, { createIfMissing: true })
    }
  }

  static buildChunkKey(x, z) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    stream.writeByte(CHUNK_KEY)
    return stream.getBuffer()
  }

  getChunkClass() {
    // chunks do not hold version info so we have to use the version
    // passed to this class's constructor ...
    return PChunk(this.version)
  }

  async waitForReady() {
    if (!this.db.isOpen()) await this.db.open()
  }

  async load(x, z) {
    await this.waitForReady()
    let key = AnvilProvider.buildChunkKey(x, z)
    let json = await this.db.getAsString(key)
    let Chunk = this.getChunkClass()
    let cc = Chunk.fromJson(json)
    return cc
  }

  async save(x, z, chunk) {
    await this.waitForReady()
    let chunkJson = chunk.toJson()
    let key = AnvilProvider.buildChunkKey(x, z)
    this.db.put(key, chunkJson)
  }
}