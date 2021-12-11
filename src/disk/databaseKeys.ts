import BinaryStream from '@jsprismarine/jsbinaryutils'

export enum Version {
  v9_00 = 0,
  v9_02 = 1, // added to fix the grass color being corrupted
  v9_05 = 2, // make sure that biomes are not corrupted
  v17_0 = 3, // switch to a key per subchunk + 2D data
  v18_0 = 4, // made beds be block entities
  vConsole1_to_v18_0 = 5, // converted from another version of the game
  v1_2_0 = 6, // Format added in MC1.2 - for upgrading structure spawners
  v1_2_0_bis = 7, // second format added in MC1.2 - to remove dynamic water in oceans
  v1_4_0 = 8,
  v1_16 = 0x15
}

export enum Tag {
  VersionNew = 44, // ','
  Data2D = 45, // height map + biomes
  Data2DLegacy = 46,
  SubChunkPrefix = 47,
  LegacyTerrain = 48,
  BlockEntity = 49,
  Entity = 50,
  PendingTicks = 51,
  BlockExtraData = 52,
  BiomeState = 53,
  FinalizedState = 54,
  BorderBlocks = 56, // Education Edition Feature
  HardCodedSpawnAreas = 57,
  Checksums = 59, // ';'
  VersionOld = 118
}

globalThis.ckeys = []

export class KeyBuilder {
  static buildChunkKey (x: int, y: byte, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.SubChunkPrefix)
    stream.writeByte(y)
    // globalThis.ckeys.push([x, y, z, dimId, stream.getBuffer()])
    return stream.getBuffer()
  }

  static buildEntityKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.Entity)
    return stream.getBuffer()
  }

  static buildBlockEntityKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.BlockEntity)
    return stream.getBuffer()
  }

  static buildHeightmapAndBiomeKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.Data2D)
    return stream.getBuffer()
  }

  static buildBiomeStateKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.BiomeState)
    return stream.getBuffer()
  }

  static buildSpawnAreaKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.HardCodedSpawnAreas)
    return stream.getBuffer()
  }

  static buildVersionKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.VersionNew)
    return stream.getBuffer()
  }

  static buildFinalizedState (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.FinalizedState)
    return stream.getBuffer()
  }

  static buildLegacyVersionKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.VersionOld)
    return stream.getBuffer()
  }

  static buildBorderBlocksKey (x: int, z: int, dimId: int) {
    const stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.BorderBlocks)
    return stream.getBuffer()
  }
}

export interface KeyData {
  x?: number
  z?: number
  y?: number
  dim?: number
  type?: string
  tagId?: number
  keyLen?: number
  valLen?: number
  skey?: String
  key?: Buffer
}

export async function recurseMinecraftKeys (db) {
  /* eslint-disable */
  function readKey(buffer: Buffer): KeyData[] {
    let offset = 0
    let read

    let ksize = buffer.length
    if (ksize >= 8) {
      let cx = buffer.readInt32LE(0)
      let cz = buffer.readInt32LE(4)
      let tagOver = buffer[8]
      let tagWithDim = buffer[12]

      let dim = 0

      let overworld = ksize === 9
      let otherDim = ksize === 13

      if (otherDim) {
        dim = buffer.readInt32LE(8)
      }

      // console.log('key', cx, cz, tagOver, tagWithDim, dim, overworld, otherDim)

      if (overworld && tagOver === Tag.VersionNew) {
        // Version 1.16.100+
        read = { x: cx, z: cz, dim: 0, tagId: tagOver, type: 'version', key: buffer }
      } else if (otherDim && tagWithDim == Tag.VersionNew) {
        // Version
        read = { x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'version', key: buffer }
      } else if (ksize == 10 && tagOver == Tag.SubChunkPrefix) {
        // Overworld chunk with subchunk
        let cy = buffer.readInt8(1 + 8)
        read = { x: cx, z: cz, y: cy, dim: dim, tagId: tagOver, type: 'chunk', key: buffer }
      } else if (ksize == 14 && tagWithDim == Tag.SubChunkPrefix) {
        // let dim = buffer.readInt32LE(offset += 4)
        let cy = buffer.readInt8(1 + 8 + 4)
        read = { x: cx, z: cz, y: cy, dim: dim, tagId: tagWithDim, type: 'chunk', key: buffer }
      } else if (otherDim && tagWithDim == Tag.Data2D) {
        // biomes and elevation for other dimensions
        read = { x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'data2d', key: buffer }      } else if (overworld && tagOver == Tag.Data2D) {
        // biomes + elevation for overworld
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'data2d', key: buffer })
      } else if (otherDim && tagWithDim == Tag.Entity) {
        // enities for dim
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'entity', key: buffer })
      } else if (overworld && tagOver == Tag.Entity) {
        // entities for overworld
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'entity', key: buffer })
      } else if (otherDim && tagWithDim == Tag.BlockEntity) {
        // block entities for dim
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'blockentity', key: buffer })
      } else if (overworld && tagOver == Tag.BlockEntity) {
        // block entities for overworld
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'blockentity', key: buffer })
      } else if (overworld && tagOver == Tag.FinalizedState) {
        // finalized state overworld chunks
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'finalizedState', key: buffer })
      } else if (otherDim && tagWithDim == Tag.FinalizedState) {
        // finalized state for other dimensions
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'finalizedState', key: buffer })
      } else if (overworld && tagOver == Tag.VersionOld) {
        // version for pre 1.16.100
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'versionOld', key: buffer })
      } else if (otherDim && tagWithDim == Tag.VersionOld) {
        // version for pre 1.16.100
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'versionOld', key: buffer })
      } else if (otherDim && tagWithDim == Tag.HardCodedSpawnAreas) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'spawnarea', key: buffer })
      } else if (overworld && tagOver == Tag.HardCodedSpawnAreas) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'spawanarea', key: buffer })
      } else if (otherDim && tagWithDim == Tag.BiomeState) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagWithDim, type: 'biomeState', key: buffer })
      } else if (overworld && tagOver == Tag.BiomeState) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'biomeState', key: buffer })
      } else if (overworld && tagOver == Tag.PendingTicks) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'pendingTick', key: buffer })
      } else if (otherDim && tagWithDim == Tag.PendingTicks) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'pendingTick', key: buffer })
      } else if (overworld && tagOver == Tag.Checksums) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'checksums', key: buffer })
      } else if (otherDim && tagWithDim == Tag.Checksums) {
        read = ({ x: cx, z: cz, dim: dim, tagId: tagOver, type: 'checksums', key: buffer })
      }

      if (!read) {
        console.log(buffer.length, 'Failed', cx, cz, buffer[9], tagOver, tagWithDim, dim, overworld, otherDim, buffer.toString())

        read = ({ x: cx, z: cz, tagId: -1, skey: String(buffer), type: `unknown / ${tagOver || ''}, ${tagWithDim || ''}`, key: buffer })
      }
    }
    let skey = String(buffer)
    if (skey.includes('VILLAGE')) {
      if (skey.includes('DWELLERS')) {
        read = ({ type: 'village-dwellers', skey: skey, key: buffer })
      } else if (skey.includes('INFO')) {
        read = ({ type: 'village-info', skey: skey, key: buffer })
      } else if (skey.includes('POI')) {
        read = ({ type: 'village-poi', skey: skey, key: buffer })
      } else if (skey.includes('PLAYERS')) {
        read = ({ type: 'village-players', skey: skey, key: buffer })
      }
    }

    if (!read) {
      read = ({ type: 'unknown', skey: String(buffer), key: buffer })
    }

    return read
  }

  if (!db || !db.isOpen()) {
    throw new Error('No database open')
  }

  const out = []

  for await (const [key] of db.getIterator({ values: true })) {
    const read = readKey(key)
    out.push(read)
  }

  return out
}

// Init xxHash
let hasher

(async () => hasher = await xxhash())()

export async function getChecksum(buffer: Buffer | Uint8Array) {
  if (!hasher) {
    hasher = await xxhash()
  }
  return Buffer.from(hasher.h64Raw(buffer))
}
