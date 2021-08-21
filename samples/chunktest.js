const fs = require('fs')
const { LevelDB } = require('leveldb-zlib')
const { WorldProvider } = require('bedrock-provider')
console.log(require('bedrock-provider'))
const ChunkColumn = require('bedrock-provider').chunk('bedrock_1.17.10')
const Block = require('prismarine-block')('bedrock_1.17.10')

async function test () {
  // Create a new ChunkColumn
  const cc = new ChunkColumn(0, 0)

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        // Set a random block ID
        const id = Math.floor(Math.random() * 1000)
        const block = Block.fromStateId(id)
        // console.log('block', block)
        cc.setBlock({ x, y, z }, block)
        const gotblock = cc.getBlock({ x, y, z })
        // console.log('Block', gotblock)
        // console.assert(gotblock.type === block.type && gotblock.type !== 0)
        if (gotblock.type !== block.type || gotblock.type === 0) throw Error()
      }
    }
  }

  // Now let's create a new database and store this chunk in there

  const db = new LevelDB('./__sample', { createIfMissing: true }) // Create a DB class
  await db.open() // Open the database
  console.log('WP', WorldProvider)
  const world = new WorldProvider(db, { dimension: 0 })
  world.save(cc)
  await db.close() // Close it
  // Done! 😃
}

try { fs.rmSync('__sample', { recursive: true }) } catch {} // Clear old dbs

test()
