import { Stream } from './Stream'
import nbt from 'prismarine-nbt'
import { PalettedBlockStateStorage } from './PalettedBlockStateStorage'
import { BlockFactory } from './BlockFactory'
import { Block } from 'prismarine-block'
import { getChecksum } from './format'

const LOG = (...args) => { }

export type BedrockBlock = Block & {
  // The Bedrock runtime ID for this block, version dependent
  brid?: number
  // The Bedrock data version this block was from
  bedrockVersion?: number
  // missing from p-block definitions ...
  states?
}

// See the Blob docs for details
export enum StorageType {
  LocalPersistence,
  NetworkPersistence,
  Runtime
}

export type PaletteEntry = { globalIndex: short, name: string, states: object, version: number }

export class SubChunk {
  factory: BlockFactory
  columnVersion: number
  sectionVersion: number
  y: number
  blocks: Uint16Array[]
  buffer?: Buffer
  palette2: Array<Map<number, PaletteEntry>>

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
  constructor (blockFactory: BlockFactory, columnVersion: number, y = 0, initialize = true) {
    this.factory = blockFactory
    this.columnVersion = columnVersion
    this.y = y
    this.palette2 = []
    this.blocks = []

    if (initialize) {
      // Fill first layer with zero
      this.blocks.push(new Uint16Array(4096))
      // Set zero to be air, Add to the palette
      const air = blockFactory.getRuntimeID('minecraft:air', {})
      this.addToPalette(0, air)
    }
  }

  async decode (format: StorageType, stream: Stream) {
    this.sectionVersion = 0

    // version
    const version = stream.readByte()

    let storageCount: byte = 1
    if (version >= 8) {
      storageCount = stream.readByte()
    }
    for (let i = 0; i < storageCount; i++) {
      const paletteType: byte = stream.readByte()
      const usingNetworkRuntimeIds = paletteType & 1

      if (!usingNetworkRuntimeIds && (format === StorageType.Runtime)) {
        throw new Error('Expected network encoding while decoding SubChunk at y=' + this.y)
      }

      const bitsPerBlock = paletteType >> 1
      await this.loadPalettedBlocks(i, stream, bitsPerBlock, format)
    }
  }

  async loadPalettedBlocks (storage: int, stream: Stream, bitsPerBlock: byte, format: StorageType) {
    while (this.blocks.length <= storage) this.blocks.push(new Uint16Array(4096))
    const bsc = new PalettedBlockStateStorage(bitsPerBlock)
    bsc.read(stream)

    const paletteSize = format == StorageType.LocalPersistence ? stream.readLInt() : stream.readVarInt()
    if (paletteSize > stream.getBuffer().length || paletteSize < 1) { throw new Error(`Invalid palette size: ${paletteSize}`) }
    if (format == StorageType.Runtime) {
      await this.loadRuntimePalette(storage, stream, paletteSize)
    } else {
      // (for persistence) N NBT tags: The palette entries, as PersistentIDs. You should read the "name" and "val" fields to figure out what blocks it represents.
      await this.loadLocalPalette(storage, stream, paletteSize, format == StorageType.NetworkPersistence)
    }

    const palette = this.palette2[storage]

    // Map a serialized palette index to our internal palette index
    const map = new Array(paletteSize)
    let count = 0
    for (const [globalKey] of palette) {
      map[count++] = globalKey
    }

    for (let x = 0; x <= 0xf; x++) {
      for (let y = 0; y <= 0xf; y++) {
        for (let z = 0; z <= 0xf; z++) {
          const localIndex: int = bsc.getBlockStateAt(x, y, z)
          if (localIndex >= count) {
            this.blocks[storage][((x << 8) | (z << 4) | y)] = 0
            throw Error('bad palette')
          }
          this.blocks[storage][((x << 8) | (z << 4) | y)] = map[localIndex]
        }
      }
    }
  }

  async loadRuntimePalette (storage: int, stream: Stream, length: int) {
    while (this.palette2.length <= storage) this.palette2.push(new Map())

    for (let i = 0; i < length; i++) {
      const index = stream.readVarInt()
      const block = this.factory.getBlockState(index)

      const name: string = block.name.value
      const states: object = block.states
      const version = block.version.value

      const mappedBlock = { globalIndex: index, name, states, version }
      this.palette2[storage].set(index, mappedBlock)
    }
    // console.log('Loaded palette', this.palette2)
  }

  async loadLocalPalette (storage: int, stream: Stream, length: int, overNetwork: boolean) {
    while (this.palette2.length <= storage) this.palette2.push(new Map())
    let i = 0
    const buf = stream.getBuffer()
    buf.startOffset = stream.getOffset()

    LOG('Stream.peek 2', stream.peek())
    while (stream.peek() == 0x0A) {
      const { parsed, metadata } = await nbt.parse(buf, overNetwork ? 'littleVarint' : 'little')
      stream.offset += metadata.size // BinaryStream
      buf.startOffset += metadata.size // Buffer

      // see A) for example schema
      const name = parsed.value.name.value as string
      const states = parsed.value.states
      const version = parsed.value.version.value as number
      const index = this.factory.getRuntimeID(name, states, version)
      const mappedBlock = { globalIndex: index, name, states, version }
      this.palette2[storage].set(index, mappedBlock)
      i++
    }
    delete buf.startOffset
    LOG('Stream.peek 3', stream.peek())

    if (i != length) {
      LOG('Palette size expected %d len, got %d', length, i)
    }
    console.assert(i == length)
  }

  async encode (formatVersion, storageFormat: StorageType): Promise<Buffer> {
    const stream = new Stream()
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
  private encode130 (stream: Stream, format: StorageType) {
    stream.writeByte(8) // write the chunk version
    stream.writeByte(this.blocks.length)
    for (let l = 0; l < this.blocks.length; l++) {
      const palette = this.palette2[l]
      let palette_type = 0 // n >> 1 = bits per block, n & 1 = 0 for local palette

      const palsize: int = palette.size
      let bitsPerBlock: byte = Math.ceil(Math.log2(palsize))
      const runtimeSerialization = format == StorageType.Runtime ? 1 : 0

      if (bitsPerBlock > 8) {
        bitsPerBlock = 16
      }

      palette_type = (bitsPerBlock << 1) | runtimeSerialization
      stream.writeByte(palette_type)

      const bss = this.toCompressedSubChunk(l, bitsPerBlock)
      bss.write(stream)

      if (format == StorageType.LocalPersistence) {
        stream.writeLInt(palsize)
      } else {
        stream.writeVarInt(palsize)
      }

      if (runtimeSerialization) {
        stream.append(this.exportRuntimePalette(l))
      } else {
        // Builds JS pallete array to be serialized to NBT
        const p = this.exportLocalPalette(l)
        for (const tag of p) {
          const buf = nbt.writeUncompressed(tag, format == StorageType.LocalPersistence ? 'little' : 'littleVarint')
          stream.append(buf)
        }
      }
    }
  }

  setBlock (x: int, y: int, z: int, block: Block) {
    // @ts-expect-error - try to set the block based on the bedrock Runtime ID if it exists, else get BRID from Java state ID
    const brid = block.brid || this.factory.getBRIDFromJSID(block.stateId || block.defaultState)
    this.setBlockID(0, x, y, z, brid)
  }

  getBlock (x: int, y: int, z: int): BedrockBlock {
    const block = this.getBlockID(0, x, y, z)
    const brid = block?.globalIndex || 0
    const jsid = this.factory.getJSIDFromBRID(brid)
    let pblock = this.factory.getPBlockFromStateID(jsid) as BedrockBlock
    if (!jsid && brid) {
      // no JSID mapping (0), but bedrock block exists, so try to translate
      // using just block name to try get a similar block rather than air
      const index = this.factory.getSimilarRuntimeID(block.name, block.version)
      if (index != -1) {
        const new_jsid = this.factory.getJSIDFromBRID(index)
        pblock = this.factory.getPBlockFromStateID(new_jsid)
        debugger // We should not be here
      } else {
        console.warn(block)
        throw Error('Failed to remap block')
      }
      pblock.name = block.name.replace('minecraft:', '')
      pblock.states = block.states
    }
    // store original BRID in Block object so we don't lose data during translation
    pblock.brid = brid
    pblock.bedrockVersion = block.version
    return pblock
  }

  addToPalette (l, runtimeId) {
    while (this.palette2.length <= l) this.palette2.push(new Map())
    const state = this.factory.getBlockState(runtimeId)
    this.palette2[l].set(runtimeId, { globalIndex: runtimeId, name: state.name.value, states: state.states, version: state.version })
    // console.log('Added to palette', l, JSON.stringify(this.palette2[l]))
    if (!state.name) throw Error('Adding nameless block to palette')
  }

  /**
   * Gets the block runtime ID at the layer and position
   * @returns Global block palette (runtime) ID for the block
   */
  getBlockID (l: int, x: int, y: int, z: int): PaletteEntry {
    // console.log('getBlock:', localIndex, globalIndex)
    return this.palette2[l].get(this.blocks[l][((x << 8) | (z << 4) | y)])
  }

  setBlockID (l, x, y, z, runtimeId: int) {
    this.updated = true
    if (!this.palette2[l]?.get(runtimeId)) {
      this.addToPalette(l, runtimeId)
    }
    this.blocks[l][((x << 8) | (z << 4) | y)] = runtimeId
  }

  // EXPORT FUNCTIONS
  toCompressedSubChunk (l: int, bitsPerBlock: int) {
    const bss = new PalettedBlockStateStorage(bitsPerBlock)

    // Build the palette map
    let index = 0
    const map = {}
    for (const [g] of this.palette2[l]) {
      map[g] = index++
    }

    for (let x = 0; x <= 0xf; x++) {
      for (let y = 0; y <= 0xf; y++) {
        for (let z = 0; z <= 0xf; z++) {
          const globalIndex = this.blocks[l][((x << 8) | (z << 4) | y)]
          bss.setBlockStateAt(x, y, z, map[globalIndex])
        }
      }
    }

    return bss
  }

  exportRuntimePalette (l: int): Buffer {
    const stream = new Stream()
    const palette = this.palette2[l]
    for (const [globalIndex] of palette) {
      stream.writeVarInt(globalIndex)
    }
    return stream.getBuffer()
  }

  // Returns a JS array of objects that can be serialized to NBT
  exportLocalPalette (l: int): nbt.NBT[] {
    const nbt = []
    let i = 0
    for (const [k, e] of this.palette2[l]) {
      nbt.push({
        type: 'compound',
        name: '',
        value: {
          name: {
            type: 'string',
            value: e.name
          },
          states: e.states,
          version: {
            type: 'int',
            value: e.version
          }
        }
      })
      i++
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