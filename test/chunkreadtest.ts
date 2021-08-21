import fs from 'fs'
import { chunk, WorldProvider, BlobStore } from 'bedrock-provider'
import { Stream } from '../src/Stream'

const ChunkColumn = chunk('bedrock_1.17.10')
const Block = require('prismarine-block')('bedrock_1.17.10')

export async function netBufferTest() {
  const buf = Buffer.from(fs.readFileSync('./chunk-0.txt', 'utf-8'), 'hex')

  console.log(buf)
  const stream = new Stream(buf)
  const packetId = stream.readVarInt()
  const x = stream.readVarInt()
  const z = stream.readVarInt()
  const subchunkCount = stream.readUnsignedVarInt()
  const cacheEnabled = stream.readByte()
  const payloadLength = stream.readUnsignedVarInt()
  const payload = stream.read(payloadLength)
  console.log('Reading chunk at ', x, z, subchunkCount, cacheEnabled)
  // console.log(stream.getBuffer().slice(stream.offset))
  console.log(payload)

  const column = new ChunkColumn(x, z)
  await column.networkDecodeNoCache(payload, subchunkCount)
  const encoded = await column.networkEncodeNoCache()
  console.log('Decoded', payload, encoded, column.biomesHash)

  if (payload.toString('hex') != encoded.toString('hex')) {
    console.log(payload.toString('hex'))
    console.log(encoded.toString('hex'))
    throw Error('Mismatch')
  }
}

export async function blobTest() {
  const blobstore = new BlobStore()
  const column = new ChunkColumn(0, 0)

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 16; y++) {
      for (let z = 3; z < 12; z++) {
        const block = Block.fromStateId(2)
        column.setBlock({ x, y, z }, block)
      }
    }
  }

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 16; y++) {
      for (let z = 3; z < 12; z++) {
        const blk = column.getBlock({ x, y, z })
        console.assert(blk.stateId == 2)
      }
    }
  }

  const { blobs, payload } = await column.networkEncode(blobstore)
  const next = new ChunkColumn(0, 0)
  const miss = await next.networkDecode(blobs, blobstore, payload)
  console.assert(miss.length == 0)
  console.log('Old', column)
  console.log('Next', next)
}

