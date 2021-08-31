// const v8 = require('v8')
/**
 * If you'd believe it, Mojang actually releases docs..... !
 * https://gist.github.com/Tomcc/4be79d3eafcd158c5059abd4ab2e8d35
 *
 */

export const enum BlobType {
  ChunkSection,
  Biomes
}

export class BlobEntry {
  x = 0
  y = 0
  z = 0
  type = BlobType.ChunkSection
  key: string
  created = Date.now()
  constructor (args) {
    Object.assign(this, args)
  }
}

const enum Backend {
  fs,
  leveldb
}

export interface CCHash { type: BlobType, hash: Buffer }

export class BlobStore extends Map {
  size: number
  backend: Backend
  backendPath: string
  cacheSize: number

  constructor (size = 64) {
    super()
    this.cacheSize = size
  }

  gc () {
    const values = Object.values(this)
    values.sort((a, b) => a.created - b.created)
    while (values.length > this.size) {
      this.delete(values.pop().key)
    }
  }

  serialize (val) {

  }

  write (key: string | Buffer, value: BlobEntry) {
    if (key instanceof Uint8Array) {
      key = key.toString('hex')
    }
    if (Object.values(this).length > this.size) {
      this.gc()
    }
    value.key = key
    this.set(key, value)
  }

  read (key: string | Buffer): BlobEntry | any {
    if (key instanceof Uint8Array) {
      key = key.toString('hex')
    }
    return this.get(key)
  }

  has (key: string | Buffer) {
    if (key instanceof Uint8Array) {
      key = key.toString('hex')
    }
    return super.has(key)
  }

  /**
   * Save on disk
   */
  async save () {
    // todo
  }

  /**
   * Load blobs from disk
   */
  async load () {

  }
}
