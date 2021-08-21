/// <reference path="./types.d.ts" />
import { Stream } from '../src/Stream'
import nbt from 'prismarine-nbt'
import { PalettedBlockStateStorage } from '../src/PalettedBlockStateStorage'
import { Block } from 'prismarine-block'
import { getChecksum } from './format'
import { BaseSubChunk } from './Chunk'

const LOG = (...args) => { }

export type PaletteEntry = { globalIndex: short, name: string, states: object, version: number }

export default function (version, subChunkVersion) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)

  return class SubChunk extends BaseSubChunk {
    columnVersion: number
    sectionVersion: number
    y: number
    blocks: Uint16Array[]
    buffer?: Buffer
    palette2: Array<Map<number, PaletteEntry>>
    rebuildPalette: boolean
    updated = true
    hash: Buffer
  
    /**
     * Create a SubChunk
     * @param columnVersions The column (NOT subchunk) version
     * @param buffer
     * @param y
     */
    constructor (y = 0) {
      super(subChunkVersion)
      this.y = y
      this.palette2 = []
      this.blocks = []
    }

    static create (y = 0) {
      const subChunk = new this(y)
      // Fill first layer with zero
      subChunk.blocks.push(new Uint16Array(4096))
      // Set zero to be air, Add to the palette
      subChunk.addToPalette(0, mcData.blocks.air.defaultState)
      return subChunk
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
          throw new Error(`Expected network encoding while decoding SubChunk at y=${this.y}`)
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
              throw Error(`bad palette size: ${localIndex} >= ${count}`)
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
        const block = mcData.blockStates[index]
        this.palette2[storage].set(index, { globalIndex: index, ...block })
      }
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
        // see A) at bottom for example schema
        const { name, states, version } = nbt.simplify(parsed)
        const block: Block = Block.fromProperties(name, states, version)
        this.palette2[storage].set(block.stateId, { globalIndex: block.stateId, name, states, version })
        i++
      }
      delete buf.startOffset
      LOG('Stream.peek 3', stream.peek())
  
      if (i !== length) {
        throw Error(`Illegal palette size: expected size ${length}, got ${i}`)
      }
    }
  
    async encode (storageFormat: StorageType, checksum = false): Promise<Buffer> {
      const stream = new Stream()
      this.encodeV8(stream, storageFormat)
      const buf = stream.getBuffer()
      if (checksum && storageFormat === StorageType.NetworkPersistence) {
        this.hash = await getChecksum(buf)
      }
      return buf
    }
  
    /**
     * Serializes SubChunk for use on disk - version 1.3+ (8)
     * @param stream Stream to write chunk data to
     * @param overNetwork encode with varints
     */
    private encodeV8 (stream: Stream, format: StorageType) {
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
  
    setBlock (l: int, x: int, y: int, z: int, block: Block) {
      this.setBlockStateId(l, x, y, z, block.stateId)
    }

    getBlock (l: int, x: int, y: int, z: int): Block {
      const stateId = this.getBlockStateId(l, x, y, z)
      return Block.fromStateId(stateId)
    }
  
    getBlockStateId (l = 0, x: int, y: int, z: int): int {
      const block = this.getPaletteEntry(l, x, y, z)
      const stateId = block?.globalIndex || 0
      return stateId
    }
  
    setBlockStateId (l: int, x: int, y: int, z: int, stateId: int) {
      this.updated = true
      if (!this.palette2[l]?.get(stateId)) {
        this.addToPalette(l, stateId)
      }
      this.blocks[l][((x << 8) | (z << 4) | y)] = stateId
    }

    addToPalette (l: int, stateId: int) {
      while (this.palette2.length <= l) this.palette2.push(new Map())
      const state = mcData.blockStates[stateId]
      this.palette2[l].set(stateId, { 
        globalIndex: stateId,
        name: state.name,
        states: state.states,
        version: state.version
      })
      if (!state.name) throw Error('Adding nameless block to palette')
    }
  
    /**
     * Gets the block runtime ID at the layer and position
     * @returns Global block palette (runtime) ID for the block
     */
    getPaletteEntry (l: int, x: int, y: int, z: int): PaletteEntry {
      return this.palette2[l].get(this.blocks[l][((x << 8) | (z << 4) | y)])
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
      const ret = []
      for (const [k, e] of this.palette2[l]) {
        nbt.comp({
          name: nbt.string('minecraft:' + e.name),
          states: e.states,
          version: nbt.int(e.version)
        })
      }
      return ret
    }
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
