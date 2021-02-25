import { LevelDB } from 'leveldb-zlib'
import { WorldProvider } from '../src/WorldProvider'
const mcdata = require('minecraft-data')('1.16.1')
const Block = require('prismarine-block')('1.16.1')

function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function testWorldLoading() {
  const gravel = mcdata.blocksByName.gravel

  let db = new LevelDB('../src/mctestdb', { createIfMissing: false })
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
        for (var y = 0; y < 4; y++) {
          for (var z = 0; z < 4; z++) {
            const blk = Block.fromStateId(rand(1, 10))
            cc.setBlock(x, y, z, blk)
            const block2 = cc.getBlock(x, y, z)
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
}

testWorldLoading()