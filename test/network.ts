// console.log = () => { throw new Error('console.log is disabled') }
// import { chunk } from 'bedrock-provider'
import Stream from 'prismarine-chunk/src/bedrock/common/Stream'
import { join } from 'path'
import PrismarineChunk, { BedrockChunk } from 'prismarine-chunk'
import { StorageType } from '../src/chunk/Chunk'
import fs from 'fs'

describe('network buffer test', function () {
  it('works on 1.18', async function () {
    const registry = require('prismarine-registry')('bedrock_1.18.0')
    const ChunkColumn = PrismarineChunk(registry) as any// as typeof BedrockChunk

    // Load the level_chunk data
    const buf = fs.readFileSync(join(__dirname, './1.18/level_chunk-8.bin'))
    const str = new Stream(buf)
    const packetType = str.readVarInt()
    const x = str.readZigZagVarInt()
    const z = str.readZigZagVarInt()
    const subchunkCount = str.readVarInt()
    const cacheEnabled = str.readByte()
    if (cacheEnabled) {
      const count = str.readVarInt()
      for (let i = 0; i < count; i++) {
        const blobs = str.readUInt32LE()
        console.log('blobs', blobs)
      }
    }
    const payload = str.readBuffer(str.readVarInt())

    const cc = new ChunkColumn(x, z)
    cc.networkDecodeNoCache(payload, subchunkCount)
    console.log('Loaded biomes', cc.biomes.length)
    if (!cc.biomes.length) {
      throw new Error('No biomes were read')
    }
    // cc.loadBiomes(biomeStream, StorageType.NetworkPersistence)
    // console.log('PEEK', biomeStream.readByte(), biomeStream.peek())

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
      console.log('Origina', originalSubchunkBuf.toString('hex'))
      console.log('Encoded', encodedSubChunk.toString('hex'))
      throw new Error('Subchunk data mismatch')
    }

    const encodedHeights = cc.getHeights()
    if (originalHeights.toString() !== encodedHeights.toString()) {
      throw new Error('Heightmap data mismatch')
    }

    const encodedPayload = await cc.networkEncodeNoCache()
    if (!payload.equals(encodedPayload)) {
      console.log('Original', payload.toString('hex'))
      console.log('Encoded', encodedPayload.toString('hex'))
      for (let i = 0; i < payload.length; i++) {
        if (payload[i] !== encodedPayload[i]) {
          console.log('Difference at', i, payload.slice(i - 5, i + 5).toString('hex'), encodedPayload.slice(i - 5, i + 5).toString('hex'))
          break
        }
      }
      throw new Error('Payload data mismatch')
    }
  })

  it('works on 1.16', async function () {
    const registry = require('prismarine-registry')('bedrock_1.16.220')
    const ChunkColumn = require('prismarine-chunk')(registry)
    // const ChunkColumn = chunk('1.16.220')
    const buf = Buffer.from(fs.readFileSync(join(__dirname, './1.16/chunk-0.txt'), 'utf-8'), 'hex')
    const stream = new Stream(buf)
    const packetId = stream.readVarInt()
    const x = stream.readZigZagVarInt()
    const z = stream.readZigZagVarInt()
    const subchunkCount = stream.readVarInt()
    const cacheEnabled = stream.readByte()
    const payloadLength = stream.readVarInt()
    const originalPayload = stream.readBuffer(payloadLength)

    const column = new ChunkColumn(x, z)
    await column.networkDecodeNoCache(originalPayload, subchunkCount)
    const encoded = await column.networkEncodeNoCache()

    if (!originalPayload.equals(encoded)) {
      console.log('Payload', originalPayload.toString('hex'))
      console.log('Encoded', encoded.toString('hex'))
      for (let i = 0; i < originalPayload.length; i++) {
        if (originalPayload[i] !== encoded[i]) {
          console.log('Difference at', i, originalPayload.slice(i - 5, i + 5).toString('hex'), encoded.slice(i - 5, i + 5).toString('hex'))
          break
        }
      }
      throw new Error('Payload does not match')
    }
  })
})