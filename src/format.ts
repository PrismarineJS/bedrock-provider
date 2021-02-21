import BinaryStream from '@jsprismarine/jsbinaryutils'

export enum Version {
  v9_00 = 0,
  v9_02 = 1,    //added to fix the grass color being corrupted
  v9_05 = 2,    //make sure that biomes are not corrupted
  v17_0 = 3,  //switch to a key per subchunk + 2D data
  v18_0 = 4,    //made beds be block entities
  vConsole1_to_v18_0 = 5, // converted from another version of the game
  v1_2_0 = 6, //Format added in MC1.2 - for upgrading structure spawners
  v1_2_0_bis = 7, //second format added in MC1.2 - to remove dynamic water in oceans
  v1_4_0 = 8,
  v1_16 = 0x15
}

export enum Tag {
  VersionNew = 44,
  Data2D = 45,
  Data2DLegacy = 46,
  SubChunkPrefix = 47,
  LegacyTerrain = 48,
  BlockEntity = 49,
  Entity = 50,
  PendingTicks = 51,
  BlockExtraData = 52,
  BiomeState = 53,
  FinalizedState = 54,
  HardCodedSpawnAreas = 57,
  VersionOld = 118
}

globalThis.ckeys = []

export class KeyBuilder {
  static buildChunkKey(x: int, y: byte, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.SubChunkPrefix)
    stream.writeByte(y)
    globalThis.ckeys.push([x, y, z, dimId, stream.getBuffer()])
    return stream.getBuffer()
  }

  static buildEntityKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.Entity)
    return stream.getBuffer()
  }

  static buildBlockEntityKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.BlockEntity)
    return stream.getBuffer()
  }

  static buildHeightmapBiomeKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.Data2D)
    return stream.getBuffer()
  }

  static buildBiomeStateKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.BiomeState)
    return stream.getBuffer()
  }

  static buildSpawnAreaKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.HardCodedSpawnAreas)
    return stream.getBuffer()
  }

  static buildVersionKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.VersionNew)
    console.log('Built key', stream.getBuffer())
    return stream.getBuffer()
  }

  static buildFinalizedState(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.FinalizedState)
    return stream.getBuffer()
  }

  static buildLegacyVersionKey(x: int, z: int, dimId: int) {
    let stream = new BinaryStream()
    stream.writeLInt(x)
    stream.writeLInt(z)
    if (dimId) {
      stream.writeLInt(dimId)
    }
    stream.writeByte(Tag.VersionOld)
    return stream.getBuffer()
  }
}

