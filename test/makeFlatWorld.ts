import { WorldProvider } from 'bedrock-provider'
import { LevelDB } from 'leveldb-zlib'
import { join } from 'path'
import assert from 'assert'
import Registry from 'prismarine-registry'
import PrismarineBlock from 'prismarine-block'
import PrismarineWorld from 'prismarine-world'
import PrismarineChunk, { BedrockChunk } from 'prismarine-chunk'
import fs from 'fs'
import { Vec3 } from 'vec3'

const versions = ['1.16.220', '1.17.10', '1.18.0']

describe('make flat world', function () {
  for (const version of versions) {
    it('works on ' + version, async () => {
      const registry = Registry('bedrock_' + version)
      const worldPath = join(__dirname, '/flat-world-' + version)
      try { fs.rmSync(worldPath, { recursive: true }) } catch (e) { }
      const db = new LevelDB(worldPath, { createIfMissing: true })
      await db.open()
      const wp = new WorldProvider(db, { dimension: 0, version })
      const world = new (PrismarineWorld())(null, wp)
      const ChunkColumn = PrismarineChunk(registry) as typeof BedrockChunk
      // @ts-ignore
      const Block = PrismarineBlock(registry)

      const l = 0 // Storage layer
      const cc = new ChunkColumn({ x: 0, z: 0 })
      for (var x = 0; x < 4; x++) {
        for (var y = 0; y < 4; y++) {
          for (var z = 0; z < 4; z++) {
            // Set a random block ID
            const id = Math.floor(Math.random() * 1000)
            const block = Block.fromStateId(id)
            cc.setBlock({ l, x, y, z }, block)
            const gotblock = cc.getBlock({ l, x, y, z })
            assert.strictEqual(gotblock.stateId, id)
            cc.setBiomeId(new Vec3(x, y, z), 0)
          }
        }
      }

      world.setLoadedColumn(0, 0, cc)
      world.queueSaving(0, 0)
      await world.saveNow() // Why does this not return proper Promise?
      await world.finishedSaving
      console.log('OK')
      await db.close()

      fs.rmSync(worldPath, { recursive: true })
    })
  }
})