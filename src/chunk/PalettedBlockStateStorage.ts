// https://gist.github.com/extremeheat/c1be82ab4a1c5eb5945de5d98b520eb3

import { Stream } from '../Stream'

const wordByteSize: int = 4
const wordBitSize: int = wordByteSize * 8

export class PalettedBlockStateStorage {
  bitsPerBlock
  blocksPerWord: byte
  paddingPerWord: byte
  wordsCount: int
  mask: int
  array: Uint32Array

  constructor (bitsPerBlock: int) {
    this.bitsPerBlock = bitsPerBlock
    this.blocksPerWord = Math.floor(wordBitSize / bitsPerBlock)
    this.paddingPerWord = wordBitSize % bitsPerBlock
    this.wordsCount = Math.ceil(4096 / this.blocksPerWord)
    this.mask = ((1 << bitsPerBlock) - 1)
    this.array = new Uint32Array(this.wordsCount)
  }

  read (stream: Stream) {
    const buf = stream.read(this.wordsCount * wordByteSize)
    this.array = new Uint32Array(new Uint8Array(buf).buffer)
  }

  write (stream: Stream) {
    stream.append(Buffer.from(this.array.buffer))
  }

  getBuffer (): Buffer {
    return Buffer.from(this.array.buffer)
  }

  readBits (index: int, offset: int) {
    return (this.array[index] >> offset) & this.mask
  }

  writeBits (index: int, offset: int, data: int) {
    this.array[index] &= ~(this.mask << offset)
    this.array[index] |= (data & this.mask) << offset
  }

  getIndex (x: int, y: int, z: int) {
    x &= 0xf
    y &= 0xf
    z &= 0xf
    const index = Math.floor(((x << 8) | (z << 4) | y) / this.blocksPerWord)
    const offset = (((x << 8) | (z << 4) | y) % this.blocksPerWord) * this.bitsPerBlock
    return [index, offset]
  }

  getBlockStateAt (x: int, y: int, z: int): int {
    const [index, offset] = this.getIndex(x, y, z)
    return this.readBits(index, offset)
  }

  setBlockStateAt (x: int, y: int, z: int, data: int) {
    const [index, offset] = this.getIndex(x, y, z)
    this.writeBits(index, offset, data)
  }
}
