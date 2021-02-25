const fs = require('fs')
const { LevelDB } = require('leveldb-zlib')
const { ChunkColumn, Version, WorldProvider } = require('../js')
const Block = require('prismarine-block')('1.16')

async function test() {
  // Create a new ChunkColumn
  let cc = new ChunkColumn(Version.v1_4_0, 0, 0)

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        // Set a random block ID
        const id = Math.floor(Math.random() * 1000)
        let block = Block.fromStateId(id)
        cc.setBlock(x, y, z, block)
        const gotblock = cc.getBlock(x, y, z)
        console.log('Block', block)
        console.assert(gotblock.type == block.type && gotblock.type != 0)
      }
    }
  }

  // Now let's create a new database and store this chunk in there

  const db = new LevelDB('./__sample', { createIfMissing: true }) // Create a DB class
  await db.open() // Open the database
  const world = new WorldProvider(db, { dimension: 0 })
  world.save(cc)
  await db.close() // Close it
  // Done! 😃
}

try { fs.rmSync('__sample', { recursive: true }) } catch {} // Clear old dbs

test()