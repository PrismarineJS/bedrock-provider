// console.log = () => { throw new Error('console.log is disabled') }

import { chunk } from 'bedrock-provider'
const { Stream } = require('../js/Stream')
const { join } = require('path')
const fs = require('fs')

describe('network buffer test', function () {
  it('works on 1.18', async function () {
    const ChunkColumn = chunk('1.18.0')

    // Load the level_chunk data
    const buf = fs.readFileSync(join(__dirname, './1.18/level_chunk-8.bin'))
    const str = new Stream(buf)
    const packetType = str.readUnsignedVarInt()
    const x = str.readVarInt()
    const z = str.readVarInt()
    const subchunkCount = str.readUnsignedVarInt()
    const cacheEnabled = str.readByte()
    if (cacheEnabled) {
      const count = str.readUnsignedVarInt()
      for (let i = 0; i < count; i++) {
        const blobs = str.readLLong()
        console.log('blobs', blobs)
      }
    }
    const payload = str.read(str.readUnsignedVarInt())

    const biomeStream = new Stream(payload)
    const cc = new ChunkColumn(x, z)
    cc.loadBiomes(biomeStream, 1)

    // 

    // (Make sure this subchunk has heightmap data when adding it to data folder)
    const subchunk = require('./1.18/subchunk.json')
    const originalSubchunkBuf = Buffer.from(subchunk.data)
    await cc.networkDecodeSubChunkNoCache(subchunk.y, originalSubchunkBuf)

    // Handle the height maps
    const originalHeights = new Uint16Array(subchunk.heightmap.data)
    cc.loadHeights(originalHeights)

    // Now encode and assert that everything is OK when we re-encode
    const encodedSubChunk = await cc.networkEncodeSubChunkNoCache(subchunk.y)

    if (!originalSubchunkBuf.equals(encodedSubChunk)) {
      console.log('Original', originalSubchunkBuf.toString('hex'))
      console.log('Encoded', encodedSubChunk.toString('hex'))
      throw new Error('Subchunk data mismatch')
    }

    const encodedHeights = cc.getHeights()
    if (originalHeights.toString() !== encodedHeights.toString()) {
      throw new Error('Heightmap data mismatch')
    }
  })

  it('works on 1.16', async function () {
    const ChunkColumn = chunk('1.16.220')
    const buf = Buffer.from(fs.readFileSync(join(__dirname, './1.16/chunk-0.txt'), 'utf-8'), 'hex')
    const stream = new Stream(buf)
    const packetId = stream.readVarInt()
    const x = stream.readVarInt()
    const z = stream.readVarInt()
    const subchunkCount = stream.readUnsignedVarInt()
    const cacheEnabled = stream.readByte()
    const payloadLength = stream.readUnsignedVarInt()
    const originalPayload = stream.read(payloadLength)

    const column = new ChunkColumn(x, z)
    await column.networkDecodeNoCache(originalPayload, subchunkCount)
    const encoded = await column.networkEncodeNoCache()

    if (!originalPayload.equals(encoded)) {
      console.log('Payload', originalPayload.toString('hex'))
      console.log('Encoded', encoded.toString('hex'))
      throw new Error('Payload does not match')
    }
  })
})