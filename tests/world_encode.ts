import { LevelDB } from 'leveldb-zlib'
import { BlobStore } from '../src/Blob';
import { ChunkColumn } from '../src/ChunkColumn';
import { Version } from '../src/format';
import { WorldProvider } from '../src/WorldProvider'
import { netBufferTest } from './chunkreadtest'
const mcdata = require('minecraft-data')('1.16.1')
const Block = require('prismarine-block')('1.16.1')

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function testWorldLoading() {
  const gravel = mcdata.blocksByName.gravel

  let db = new LevelDB('./mctestdb', { createIfMissing: false })
  await db.open()
  let wp = new WorldProvider(db, { dimension: 0 })
  let keys = await wp.getKeys()
  for (var _key of keys) {
    let key = _key[0]
    // console.log(key.type)
    if (key.type == 'version') {
      // console.log('version', key.x, key.z, key.key)

      const cc = await wp.load(key.x, key.z, true)
      for (var x = 0; x < 4; x++) {
        for (var y = 0; y < 255; y += 3) {
          for (var z = 0; z < 4; z++) {
            const blk = Block.fromStateId(rand(1, 10))
            cc.setBlock({ x, y, z }, blk)
            const block2 = cc.getBlock({ x, y, z })
            if (blk.name !== block2.name) {
              console.log('Got new block', blk, block2)
              throw Error('ID mismatch')
            }
          }
        }
      }

      // await wp.save(cc)
      // break
    }
  }
  console.log(globalThis.ckeys)
  // console.log('Keys', keys)
  await db.close()
}

async function testNetworkNoCache() {
  let db = new LevelDB('./mctestdb', { createIfMissing: false })
  await db.open()
  let wp = new WorldProvider(db, { dimension: 0 })
  let keys = await wp.getKeys()
  for (var _key of keys) {
    let key = _key[0]
    if (key.type == 'version') {
      const cc = await wp.load(key.x, key.z, true)

      const buf = await cc.networkEncodeNoCache()
      console.log('Network encoded buffer', buf.toString('hex'))
      const cc2 = new ChunkColumn(cc.version, key.x, key.z)
      await cc2.networkDecodeNoCache(buf, cc.sectionsLen)

      const buf2 = await cc2.networkEncodeNoCache()

      if (buf.toString('hex') !== buf2.toString('hex')) {
        console.log(buf.toString('hex'))
        console.log(buf2.toString('hex'))
        throw Error('encode mismatch')
      }
    }
  }
  await db.close()
}

async function testNetworkWithCache() {
  const blobstore = new BlobStore()
  const column = new ChunkColumn(Version.v1_2_0_bis, 0, 0)

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 256; y += 3) {
      for (let z = 3; z < 12; z++) {
        const block = Block.fromStateId(2)
        column.setBlock({ x, y, z }, block)
      }
    }
  }

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 256; y += 3) {
      for (let z = 3; z < 12; z++) {
        const blk = column.getBlock({ x, y, z })
        console.assert(blk.stateId == 2)
      }
    }
  }

  const { blobs, payload } = await column.networkEncode(blobstore)
  const next = new ChunkColumn(Version.v1_2_0_bis, 0, 0)
  const miss = await next.networkDecode(blobs, blobstore, payload)
  console.assert(miss.length == 0)
  if (miss.length != 0) throw Error()
  console.log('Old', column)
  console.log('Next', next)
}

async function testNetworkWithBadCache() {
  const blobstore = new BlobStore()
  const column = new ChunkColumn(Version.v1_2_0_bis, 0, 0)

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 22; y += 2) {
      for (let z = 3; z < 12; z++) {
        const block = Block.fromStateId(rand(1, 2))
        column.setBlock({ x, y, z }, block)
      }
    }
  }

  for (let x = 0; x < 16; x++) {
    for (let y = 5; y < 22; y += 2) {
      for (let z = 3; z < 12; z++) {
        const blk = column.getBlock({ x, y, z })
        console.assert(blk.stateId == 2 || blk.stateId == 1)
      }
    }
  }

  const { blobs, payload } = await column.networkEncode(blobstore)
  console.log('Blobs', blobs)

  for (var i = 0; i < blobs.length; i++) {
    for (var j = i + 1; j < blobs.length; j++) {
      if (blobs[i].hash.toString('hex') == blobs[j].hash.toString('hex')) {
        throw Error('Duplicate hashes! Did writing fail?')
      }
    }
  }

  for (const [k] of blobstore) {
    blobstore.delete(k)
    break
  }
  // blobstore.clear()

  const next = new ChunkColumn(Version.v1_2_0_bis, 0, 0)
  const miss = await next.networkDecode(blobs, blobstore, payload)
  console.log('Missing', miss)
  if (miss.length !== 1) throw Error('Expected 1 missing blob')
  // console.log('Old', column)
  // console.log('Next', next)
}

async function runTests() {
  await testWorldLoading()
  await testNetworkNoCache()
  await testNetworkWithCache()
  await testNetworkWithBadCache()
  await netBufferTest()
  console.log('✔ All OK')
}

runTests()