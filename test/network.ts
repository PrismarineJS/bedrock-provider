import { chunk } from 'bedrock-provider'
const { Stream } = require('../js/Stream')
const { join } = require('path')
const fs = require('fs')

// function describe(name: string, fn: () => void) {
//   console.log(name)
//   fn()
// }

// async function it(name: string, fn: () => void) {
//   console.log('  ' + name)
//   await fn()
// }

describe('network buffer test', function () {
  it('works on 1.18', function () {
    const ChunkColumn = chunk('1.18.0')

    // Load the level_chunk data
    const buf = fs.readFileSync(join(__dirname, './1.18/level_chunk-8.bin'))
    const str = new Stream(buf)
    const packetType = str.readUnsignedVarInt()
    console.log(packetType)
    const x = str.readVarInt()
    const z = str.readVarInt()
    const scCount = str.readUnsignedVarInt()
    const cacheEnabled = str.readByte()
    if (cacheEnabled) {
      const count = str.readUnsignedVarInt()
      for (let i = 0; i < count; i++) {
        const blobs = str.readLLong()
        console.log('blobs', blobs)
      }
    }
    const payload = str.read(str.readUnsignedVarInt())
    console.log('Payload', scCount, payload, payload.toString('hex'))

    const biomeStream = new Stream(payload)
    const cc = new ChunkColumn(x, z)
    cc.loadBiomes(biomeStream, 1)

    // 

    const subchunk = require('./1.18/subchunk.json')
    cc.networkDecodeSubChunkNoCache(subchunk.y, Buffer.from(subchunk.data))
    // TODO: load the heightmap data
    // cc.loadHeights(Buffer.from(subchunk.heightmap))

    console.log('CC', cc)
  })

  // it('works on 1.16', async function () {
  //   const ChunkColumn = chunk('1.16.220')
  //   const buf = Buffer.from(fs.readFileSync(join(__dirname, './1.16/chunk-0.txt'), 'utf-8'), 'hex')
  //   const stream = new Stream(buf)
  //   const packetId = stream.readVarInt()
  //   const x = stream.readVarInt()
  //   const z = stream.readVarInt()
  //   const subchunkCount = stream.readUnsignedVarInt()
  //   const cacheEnabled = stream.readByte()
  //   const payloadLength = stream.readUnsignedVarInt()
  //   const payload = stream.read(payloadLength)
  //   console.log('Reading chunk at ', x, z, subchunkCount, cacheEnabled)
  //   // console.log(stream.getBuffer().slice(stream.offset))
  //   console.log(payload)
  
  //   const column = new ChunkColumn(x, z)
  //   await column.networkDecodeNoCache(payload, subchunkCount)
  //   const encoded = await column.networkEncodeNoCache()

  //   if (!payload.equals(encoded)) {
  //     console.log('Payload', payload.toString('hex'))
  //     console.log('Encoded', encoded.toString('hex'))
  //     throw new Error('Payload does not match')
  //   }
  // })
})