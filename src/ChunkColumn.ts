/// <reference path="./global.d.ts" />
import BinaryStream from "@jsprismarine/jsbinaryutils";
import { Version } from "./format";
import { PalettedBlockStateStorage } from "./PalettedBlockStateStorage";
import { BlockFactory } from  './BlockFactory'
import nbt from 'prismarine-nbt'
import { Block } from "prismarine-block";
import { debug } from "console";

const MIN_Y = 0
const MAX_Y = 15

export class ChunkColumn {
  x: number; z: number
  version: number
  sections: SubChunk[]
  sectionsLen: number

  minY = MIN_Y
  maxY = MAX_Y

  constructor(version: Version, x, z) {
    this.version = version
    this.x = x
    this.z = z
    this.sections = []
    this.sectionsLen = 0
  }

  getBlock(sx: int, sy: int, sz: int): Block {
    let y = sy >> 4
    let sec = this.sections[this.minY + y]
    if (sec) return sec.getBlock(sx, sy & 0xf, sz)
    return BlockFactory.getPBlockFromStateID(0)
  }

  setBlock(sx: int, sy: int, sz: int, block: Block) {
    let y = sy >> 4
    if (y < this.minY || y >= this.maxY) return
    let sec = this.sections[this.minY + y]
    while (!sec) {
      this.addSection(new SubChunk(this.version))
      sec = this.sections[this.minY + y]
    }
    return sec.setBlock(sx, sy & 0xf, sz, block)
  }

  addSection(section: SubChunk) {
    this.sections.push(section)
  }

  getSection(y) {
    return this.sections[this.minY + y]
  }

  addEntity() {

  }

  getSections(): SubChunk[] {
    return this.sections
  }

  getEntities() {

  }

  getBlockEntities() {

  }

  networkEncode(formatVersion) {

  }
}

// @ts-ignore
BinaryStream.prototype.peek = function () {
  return this.buffer[this.offset]
}

const LOG = (...args) => console.debug('[cc]', ...args)

export class SubChunk {
  formatVersion: number
  sectionVersion: number
  y: number
  blocks: Uint16Array[]
  buffer?: Buffer
  palette: { globalIndex: short, name: string, states: object, version: number }[][]

  rebuildPalette: boolean

  lastSetBlockId

  constructor(formatVersion: number, buffer?: Buffer, y = 0) {
    this.formatVersion = formatVersion
    this.y = y
    this.palette = []
    this.blocks = []
    if (buffer) {
      this.buffer = buffer
    } else {
      // init empty layer 0
      this.blocks.push(new Uint16Array(4096))
      this.palette.push([])
    }
  }

  async decode(buffer = this.buffer) {
    this.sectionVersion = 0
    let stream = new BinaryStream(buffer)

    // version
    let version = stream.readByte()

    let storageCount: byte = 1
    if (version >= 8) {
      storageCount = stream.readByte()
    }

    let paletteType: byte = stream.readByte()
    let usingNetworkRuntimeIds = paletteType & 1

    for (let i = 0; i < storageCount; i++) {
      // if (i != 0)
      // continue; // We don't support 1.4 yet! Need to support multiple palettes
      let bitsPerBlock = paletteType >> 1;

      await this.loadPalettedBlocks(i, stream, bitsPerBlock, !!usingNetworkRuntimeIds)
    }
  }

  async loadPalettedBlocks(storage: int, stream: BinaryStream, bitsPerBlock: byte, networkRuntimeIds: boolean) {
    let bsc = new PalettedBlockStateStorage(bitsPerBlock)
    bsc.read(stream)

    let paletteSize = networkRuntimeIds ? stream.readVarInt() : stream.readByte()
    console.log('Palette size is', paletteSize, stream.getOffset(), stream.getBuffer().length)
    this.blocks.push(new Uint16Array(4096))
    // unsigned int size
    // stream.read((char*)&size, 4);

    // LOG("Pos is: %d\n", stream.tellg());

    if (networkRuntimeIds) {
      this.loadNetworkPalette(storage, stream, paletteSize)
    } else {
      // (for persistence) N NBT tags: The palette entries, as PersistentIDs. You should read the "name" and "val" fields to figure out what blocks it represents.
      await this.loadLocalPalette(storage, stream, paletteSize);
    }
    console.log('Palete', storage, bitsPerBlock, this.palette)
    // process.exit(0)

    const palette = this.palette[storage]

    for (let x = 0; x <= 0xf; x++) {
      for (let y = 0; y <= 0xf; y++) {
        for (let z = 0; z <= 0xf; z++) {
          let localIndex: int = bsc.getBlockStateAt(x, y, z)
          console.assert(!(localIndex >= palette.length));
          if (localIndex >= palette.length) {
            console.warn("ERROR: PalettedSubChunk: BLOCK AT %d, %d, %d is out of palette bounds! (%d/%d)\n", x, y, z, localIndex, palette.length)
            this.blocks[storage][((x << 8) | (z << 4) | y)] = 0
          }
          // let paletted_block = this.palette[bsv]
          // this.blocks[((x << 8) | (z << 4) | y)] = paletted_block.index
          this.blocks[storage][((x << 8) | (z << 4) | y)] = localIndex
        }
      }
    }
  }

  async loadNetworkPalette(storage: int, stream: BinaryStream, length: int) {
    while (this.palette.length <= storage) this.palette.push([])

    for (let i = 0; i < length; i++) {
      let index = stream.readVarInt()
      let block = BlockFactory.getBlockState(index)
      
      let name: string = block.value.name.value
      let states: object = block.value.states
      let version = block.value.version.value
      if (typeof version == 'object') version = version[1] // temp

      let mappedBlock = { globalIndex: index, name, states, version }
      this.palette[storage].push(mappedBlock)
    }
  }

  async loadLocalPalette(storage: int, stream, length: int) {
    while (this.palette.length <= storage) this.palette.push([])
    console.log(this.palette.length, storage)
    let nextByte: byte = 0
    while (stream.peek() != 0x0A) {
      LOG('Stream.peek', stream.peek())
      if (stream.peek() == '\0')
        return
      nextByte = stream.readByte()
      LOG("Skipped byte: %d", nextByte)
    }

    let i = 0
    let buf = stream.getBuffer()
    buf.startOffset = stream.getOffset()

    LOG('Stream.peek 2', stream.peek())
    while (stream.peek() == 0x0A) {
      let { result, metadata } = await nbt.parse(buf, 'little')
      console.log('Reading NBT', result, metadata)
      stream.offset += metadata.size // BinaryStream
      buf.startOffset += metadata.size // Buffer

      // see A) for example schema
      let name: string = result.value.name.value
      let states: object = result.value.states
      let version = result.value.version.value
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

  encode(formatVersion): Buffer {
    let stream = new BinaryStream()
    this.encode130(stream)
    return stream.getBuffer()
  }

  /**
   * Serializes SubChunk for use on disk - version 1.3+
   * @param stream Stream to write chunk data to
   */
  private encode130(stream: BinaryStream, overNetwork = false) {
    stream.writeByte(8) // write the chunk version
    stream.writeByte(this.blocks.length)
    for (let l = 0; l < this.blocks.length; l++) {
      let palette = this.palette[l]
      let palette_type = 0; // n >> 1 = bits per block, n & 1 = 0 for local palette

      let palsize: int = palette.length;
      let bitsPerBlock: byte = Math.ceil(Math.log2(palsize))
      let over_network = overNetwork ? 1 : 0

      if (bitsPerBlock > 8) {
        bitsPerBlock = 16;
      }

      palette_type = (bitsPerBlock << 1) | over_network
      stream.writeByte(palette_type)

      let bss = this.toCompressedSubChunk(l, bitsPerBlock)
      bss.write(stream)

      overNetwork ? stream.writeVarInt(palsize) : stream.writeLInt(palsize)

      // Builds JS pallete array to be serialized to NBT
      let p = this.exportLocalPalette(l)
      for (let tag of p) {
        console.log('Saving', JSON.stringify(tag))
        let buf = nbt.writeUncompressed(tag, overNetwork ? 'littleVarint' : 'little')
        stream.append(buf)
      }
    }
  }

  /**
   * Encodes this SubChunk for use over network using VarInts
   */
  networkEncode(formatVersion) {
    let stream = new BinaryStream()
    this.encode130(stream, true)
    return stream.getBuffer()
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
    const ver = state.version[1]?state.version[1]:state.version
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

  // Returns a JS array of objects that can be serialized to NBT
  exportLocalPalette(l: int): nbt.NBT[] {
    let nbt = []
    for (let i = 0; i < this.palette[l].length; i++) {
      let e = this.palette[l][i]
      console.log(e)
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