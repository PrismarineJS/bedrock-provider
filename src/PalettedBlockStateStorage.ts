// https://gist.github.com/extremeheat/c1be82ab4a1c5eb5945de5d98b520eb3

import BinaryStream from "@jsprismarine/jsbinaryutils"

const wordByteSize: int = 4
const wordBitSize: int = wordByteSize * 8

export class PalettedBlockStateStorage {
  bitsPerBlock
  blocksPerWord: byte
  paddingPerWord: byte
  wordsCount: int
  mask: int
  array: Uint32Array

  constructor(bitsPerBlock) {
    this.bitsPerBlock = bitsPerBlock
    this.blocksPerWord = Math.floor(wordBitSize / bitsPerBlock)
    this.paddingPerWord = wordBitSize % bitsPerBlock
    this.wordsCount = Math.ceil(4096 / this.blocksPerWord)
    this.mask = ((1 << bitsPerBlock) - 1)
    this.array = new Uint32Array(this.wordsCount)
  }

  read(stream: BinaryStream) {
    let buf = stream.read(this.wordsCount * wordByteSize)
    this.array = Uint32Array.from(buf)
  }

  write(stream: BinaryStream) {
    stream.append(Buffer.from(this.array.buffer))
  }

  readBits(index, offset) {
    return (this.array[index] >> offset) & this.mask
  }

  writeBits(index, offset, data) {
    this.array[index] &= ~(this.mask << offset)
    this.array[index] |= (data & this.mask) << offset
  }

  getIndex(x, y, z) {
    x &= 0xf
    y &= 0xf
    z &= 0xf
    let index = Math.floor(((x << 8) | (z << 4) | y) / this.blocksPerWord)
    let offset = (((x << 8) | (z << 4) | y) % this.blocksPerWord) * this.bitsPerBlock
    return [ index, offset ]
  }

  getBlockStateAt(x, y, z) {
    const [ index, offset ] = this.getIndex(x, y, z)
    return this.readBits(index, offset)
  }

  setBlockStateAt(x, y, z, data) {
    const [ index, offset ] = this.getIndex(x, y, z)
    this.writeBits(index, offset, data)
  }
}