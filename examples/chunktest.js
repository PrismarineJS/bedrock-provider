const { LevelDB } = require('leveldb-zlib')
const { WorldProvider } = require('bedrock-provider')
const registry = require('prismarine-registry')('bedrock_1.17.10')
const ChunkColumn = require('prismarine-chunk')(registry)
const Block = require('prismarine-block')(registry)

const fs = require('fs')
const assert = require('assert')

async function test () {
  // Create a new ChunkColumn
  const cc = new ChunkColumn({ x: 0, z: 0 })

  const l = 0 // Storage layer
  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        // Set a random block ID
        const id = Math.floor(Math.random() * 1000)
        const block = Block.fromStateId(id)
        cc.setBlock({ l, x, y, z }, block)
        const gotblock = cc.getBlock({ l, x, y, z })
        assert.strictEqual(gotblock.stateId, id)
      }
    }
  }

  // Now let's create a new database and store this chunk in there

  const db = new LevelDB('./__sample', { createIfMissing: true }) // Create a DB class
  await db.open() // Open the database
  const world = new WorldProvider(db, { dimension: 0 })
  await world.save(0, 0, cc)
  await db.close() // Close it
  console.log('Done! 😃')
}

try { fs.rmSync('__sample', { recursive: true }) } catch {} // Clear old dbs

test()
