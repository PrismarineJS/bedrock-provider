import { Stream } from './Stream'
import nbt from 'prismarine-nbt'
import { PalettedBlockStateStorage } from "./PalettedBlockStateStorage";
import { BlockFactory } from './BlockFactory'
import { Block } from "prismarine-block";
import { getChecksum } from './format'

const LOG = (...args) => console.debug('[cc]', ...args)

// See the Blob docs for details
export enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}

export class SubChunk {
  columnVersion: number
  sectionVersion: number
  y: number
  blocks: Uint16Array[]
  buffer?: Buffer
  palette: { globalIndex: short, name: string, states: object, version: number }[][]

  rebuildPalette: boolean

  lastSetBlockId

  updated = true
  hash: Buffer

  /**
   * Create a SubChunk
   * @param columnVersions The column (NOT subchunk) version
   * @param buffer 
   * @param y 
   */
  constructor(columnVersion: number, buffer?: Buffer, y = 0) {
    this.columnVersion = columnVersion
    this.y = y
    this.palette = []
    this.blocks = []
    if (buffer) {
      this.buffer = buffer
    } else {
      // init empty layer 0
      // this.blocks.push(new Uint16Array(4096))
      this.palette.push([])
    }
  }

  async decode(format: StorageType, stream = new Stream(this.buffer)) {
    this.sectionVersion = 0

    // version
    let version = stream.readByte()

    let storageCount: byte = 1
    if (version >= 8) {
      storageCount = stream.readByte()
    }

    let paletteType: byte = stream.readByte()
    let usingNetworkRuntimeIds = paletteType & 1
    // console.warn('! DCODED with palette type ', paletteType, storageCount)

    if (!usingNetworkRuntimeIds && (format !== StorageType.LocalPersistence)) {
      throw new Error('Expected network encoding while decoding SubChunk at y='+ this.y)
    }

    for (let i = 0; i < storageCount; i++) {
      let bitsPerBlock = paletteType >> 1;
      // console.warn('! DECODE BITSPER ', bitsPerBlock)

      await this.loadPalettedBlocks(i, stream, bitsPerBlock, format)
    }
  }

  async loadPalettedBlocks(storage: int, stream: Stream, bitsPerBlock: byte, format: StorageType) {
    let bsc = new PalettedBlockStateStorage(bitsPerBlock)
    bsc.read(stream)

    let paletteSize = format == StorageType.LocalPersistence ? stream.readLInt() : stream.readVarInt() 
    // console.warn('Palette size is', paletteSize, stream.getOffset(), stream.getBuffer().length)
    this.blocks.push(new Uint16Array(4096))
    // unsigned int size
    // stream.read((char*)&size, 4);

    // LOG("Pos is: %d\n", stream.tellg());

    if (format == StorageType.Runtime) {
      await this.loadRuntimePalette(storage, stream, paletteSize)
    } else {
      // (for persistence) N NBT tags: The palette entries, as PersistentIDs. You should read the "name" and "val" fields to figure out what blocks it represents.
      await this.loadLocalPalette(storage, stream, paletteSize, format == StorageType.NetworkPersistence)
    }
    // console.warn('Palete', JSON.stringify(this.palette))
    // console.log('Palete', storage, bitsPerBlock, this.palette)
    // process.exit(0)

    const palette = this.palette[storage]

    // console.log('bsc', bsc.getBuffer().toString('hex'))

    for (let x = 0; x <= 0xf; x++) {
      for (let y = 0; y <= 0xf; y++) {
        for (let z = 0; z <= 0xf; z++) {
          let localIndex: int = bsc.getBlockStateAt(x, y, z)
          // console.log('*GET',this.y, x,y,z,localIndex)
          console.assert(!(localIndex >= palette.length));
          if (localIndex >= palette.length) {
            console.warn("ERROR: PalettedSubChunk: BLOCK AT %d, %d, %d is out of palette bounds! (%d/%d)\n", x, y, z, localIndex, palette.length)
            this.blocks[storage][((x << 8) | (z << 4) | y)] = 0
            throw Error()
          }
          // let paletted_block = this.palette[bsv]
          // this.blocks[((x << 8) | (z << 4) | y)] = paletted_block.index
          this.blocks[storage][((x << 8) | (z << 4) | y)] = localIndex
        }
      }
    }
  }

  async loadRuntimePalette(storage: int, stream: Stream, length: int) {
    while (this.palette.length <= storage) this.palette.push([])

    for (let i = 0; i < length; i++) {
      let index = stream.readVarInt()
      // console.log('Read',index)
      let block = BlockFactory.getBlockState(index)

      // console.log(index, block)
      let name: string = block.name.value
      let states: object = block.states
      let version = block.version.value
      if (typeof version == 'object') version = version[1] // temp

      let mappedBlock = { globalIndex: index, name, states, version }
      this.palette[storage].push(mappedBlock)
    }
  }

  async loadLocalPalette(storage: int, stream: Stream, length: int, overNetwork: boolean) {
    while (this.palette.length <= storage) this.palette.push([])
    let i = 0
    let buf = stream.getBuffer()
    buf.startOffset = stream.getOffset()

    LOG('Stream.peek 2', stream.peek())
    while (stream.peek() == 0x0A) {
      const { parsed, metadata } = await nbt.parse(buf, overNetwork ? 'littleVarint' : 'little')
      // console.log('Reading NBT', parsed, metadata)
      stream.offset += metadata.size // BinaryStream
      buf.startOffset += metadata.size // Buffer

      // see A) for example schema
      let name = parsed.value.name.value as string
      let states = parsed.value.states
      let version = parsed.value.version.value as number
      // if (typeof version == 'object') version = version[1] // temp
      // console.log(result)
      let index = BlockFactory.getRuntimeID(name, states, version)
      // PaletteMappedBlockID mapped_block{ name, meta, index }
      let mappedBlock = { globalIndex: index, name, states, version }
      this.palette[storage].push(mappedBlock)
      i++;
    }
    delete buf.startOffset
    LOG('Stream.peek 3', stream.peek())

    if (i != length) {
      LOG("Palette size expected %d len, got %d", length, i);
    }
    console.assert(i == length);
  }

  async encode(formatVersion, storageFormat: StorageType): Promise<Buffer> {
    let stream = new Stream()
    this.encode130(stream, storageFormat)
    const buf = stream.getBuffer()
    if (storageFormat == StorageType.NetworkPersistence) {
      this.hash = await getChecksum(buf)
    }
    return buf
  }

  /**
   * Serializes SubChunk for use on disk - version 1.3+
   * @param stream Stream to write chunk data to
   * @param overNetwork encode with varints
   */
  private encode130(stream: Stream, format: StorageType) {
    stream.writeByte(8) // write the chunk version
    stream.writeByte(this.blocks.length)
    for (let l = 0; l < this.blocks.length; l++) {
      console.log('Pal', l, this.palette, this.blocks)
      let palette = this.palette[l]
      let palette_type = 0; // n >> 1 = bits per block, n & 1 = 0 for local palette

      let palsize: int = palette.length;
      let bitsPerBlock: byte = Math.ceil(Math.log2(palsize))
      let runtimeSerialization = format == StorageType.Runtime ? 1 : 0

      if (bitsPerBlock > 8) {
        bitsPerBlock = 16;
      }

      palette_type = (bitsPerBlock << 1) | runtimeSerialization
      // console.warn('! ENCODED with palette type ', palette_type, bitsPerBlock)
      stream.writeByte(palette_type)

      let bss = this.toCompressedSubChunk(l, bitsPerBlock)
      bss.write(stream)

      if (runtimeSerialization) {
        stream.writeVarInt(palsize)
        stream.append(this.exportRuntimePalette(l))
      } else {
        stream.writeLInt(palsize)
        // Builds JS pallete array to be serialized to NBT
        const p = this.exportLocalPalette(l)
        for (let tag of p) {
          console.log('Saving', JSON.stringify(tag))
          let buf = nbt.writeUncompressed(tag, format == StorageType.LocalPersistence ? 'little' : 'littleVarint')
          stream.append(buf)
        }
      }
    }
  }

  setBlock(x: int, y: int, z: int, block: Block) {
    // @ts-ignore
    let brid = block['brid'] || BlockFactory.getBRIDFromJSID(block.stateId || block.defaultState)
    this.setBlockID(0, x, y, z, brid)
    console.log(`Setting ${x} ${y} ${z} layer 0 to ${brid}`, block)
  }

  getBlock(x: int, y: int, z: int): Block {
    let block = this.getBlockID(0, x, y, z)
    let brid = block?.globalIndex || 0
    // console.log(`Got ${x} ${y} ${z} layer 0 to ${brid}`)
    let jsid = BlockFactory.getJSIDFromBRID(brid)
    let pblock = BlockFactory.getPBlockFromStateID(jsid)
    if (!jsid && brid) {
      // no JSID mapping (0), but bedrock block exists, so try to translate
      // using just block name to try get a similar block rather than air
      const index = BlockFactory.getSimilarRuntimeID(block.name, block.version)
      if (index != -1) {
        const new_jsid = BlockFactory.getJSIDFromBRID(index)
        pblock = BlockFactory.getPBlockFromStateID(new_jsid)
        console.warn('remapped', block, new_jsid, pblock)
      } else {
        console.warn(block)
        throw 'Failed to remap'
      }
      pblock.name = block.name.replace('minecraft:', '')
      pblock.states = block.states
    }
    // store original BRID in Block object so we don't lose data during translation
    pblock.brid = brid
    pblock.bedrockVersion = block.version
    return pblock
  }

  getIndexInPalette(l, runtimeId) {
    for (let i = 0; i < this.palette.length; i++) {
      if (this.palette[l][i]?.globalIndex == runtimeId) {
        return i
      }
    }
    return -1
  }

  addToPalette(l, runtimeId, version = 0) {
    let state = BlockFactory.getBlockState(runtimeId)
    const ver = state.version[1] ? state.version[1] : state.version
    this.palette[l].push({ globalIndex: runtimeId, name: state.name.value, states: state.states, version: ver })
    console.log('Added to palette', JSON.stringify(this.palette[l]))
    if (!state.name) throw 'No name!'
    return this.palette[l].length - 1
  }

  getBlockID(l: int, x: int, y: int, z: int) {
    let localIndex = this.blocks[l][((x << 8) | (z << 4) | y)]
    let globalIndex = this.palette[l][localIndex]
    // console.log('getBlock:', localIndex, globalIndex)
    return globalIndex
  }

  setBlockID(l, x, y, z, runtimeId: int) {
    this.updated = true

    // TODO: removing from palete
    if (this.lastSetBlockId?.id == runtimeId) {
      // console.log('Setting', ((x << 8) | (z << 4) | y), 'to', this.lastSetBlockId)
      this.blocks[l][((x << 8) | (z << 4) | y)] = this.lastSetBlockId.localIndex
      return
    }
    let i = this.getIndexInPalette(l, runtimeId)
    if (i == -1) {
      i = this.addToPalette(l, runtimeId)
    }
    // console.log('adding block', i, this.palette[0])
    this.blocks[l][((x << 8) | (z << 4) | y)] = i
    this.lastSetBlockId = { id: runtimeId, localIndex: i }
    // console.log('added: ', this.blocks[l])
  }

  // EXPORT FUNCTIONS
  toCompressedSubChunk(l, bitsPerBlock) {
    let bss = new PalettedBlockStateStorage(bitsPerBlock);

    for (let x = 0; x <= 0xf; x++) {
      for (let y = 0; y <= 0xf; y++) {
        for (let z = 0; z <= 0xf; z++) {
          let localIndex = this.blocks[l][((x << 8) | (z << 4) | y)]
          bss.setBlockStateAt(x, y, z, localIndex)
        }
      }
    }

    return bss
  }

  exportRuntimePalette(l: int): Buffer {
    const stream = new Stream()
    for (let i = 0; i < this.palette[l].length; i++) {
      let e = this.palette[l][i]
      stream.writeVarInt(e.globalIndex)
      // const state = BlockFactory.getBlockState(e.globalIndex)
      // console.log('state', state)
      // console.log('wrote', e)
    }
    return stream.getBuffer()
  }

  // Returns a JS array of objects that can be serialized to NBT
  exportLocalPalette(l: int): nbt.NBT[] {
    let nbt = []
    for (let i = 0; i < this.palette[l].length; i++) {
      let e = this.palette[l][i]
      // console.log('EXPORT', e)
      nbt.push({
        "type": "compound",
        "name": "",
        "value": {
          "name": {
            "type": "string",
            "value": e.name
          },
          "states": e.states,
          "version": {
            "type": "int",
            "value": e.version
          }
        }
      })
    }
    return nbt
  }
}

/*
A) Block Pallete Entry
e.g. data:
{
  "type": "compound",
  "name": "",
  "value": {
    "name": {
      "type": "string",
      "value": "minecraft:bedrock"
    },
    "states": {
      "type": "compound",
      "value": {
        "infiniburn_bit": {
          "type": "byte",
          "value": 0
        }
      }
    },
    "version": {
      "type": "int",
      "value": 17825808
    }
  }
}
*/