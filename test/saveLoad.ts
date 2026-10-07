import { WorldProvider } from 'bedrock-provider'
import { LevelDB } from 'leveldb-zlib'
import { join } from 'path'
import assert from 'assert'
import Registry from 'prismarine-registry'
import PrismarineChunk from 'prismarine-chunk'
import fs from 'fs'

// Versions whose columns store each sub chunk under its own key
const subChunkVersions = ['1.18.0', '1.19.1', '1.20.0', '1.21.0']

type Pos = { l: number, x: number, y: number, z: number }

describe('save and load', function () {
  for (const version of subChunkVersions) {
    const registry = Registry('bedrock_' + version)
    const ChunkColumn = PrismarineChunk(registry) as any
    const worldPath = join(__dirname, '/flat-save-load-' + version)
    let db: LevelDB
    let wp: WorldProvider

    beforeEach(async () => {
      try { fs.rmSync(worldPath, { recursive: true }) } catch (e) { }
      db = new LevelDB(worldPath, { createIfMissing: true })
      await db.open()
      wp = new WorldProvider(db, { dimension: 0, registry })
    })

    afterEach(async () => {
      await db.close()
      fs.rmSync(worldPath, { recursive: true })
    })

    // Sets a few blocks in the sub chunk at chunk Y `cy`, all of a state no other sub chunk uses,
    // so a sub chunk saved or loaded at the wrong height is caught
    function fillSubChunk (column, cy: number) {
      const stateId = (cy - column.minCY) * 37 + 1
      const blocks: Array<{ pos: Pos, stateId: number }> = []
      for (const [x, y, z] of [[0, 0, 0], [1, 7, 3], [15, 15, 15]]) {
        const pos = { l: 0, x, y: cy * 16 + y, z }
        column.setBlockStateId(pos, stateId)
        blocks.push({ pos, stateId })
      }
      return blocks
    }

    async function saveAndLoad (column) {
      await wp.save(column.x, column.z, column)
      return await wp.load(column.x, column.z, false)
    }

    function assertSubChunks (loaded, subChunkYs: number[], blocks: Array<{ pos: Pos, stateId: number }>) {
      for (let cy = loaded.minCY; cy < loaded.maxCY; cy++) {
        assert.strictEqual(!!loaded.getSectionAtIndex(cy), subChunkYs.includes(cy), `sub chunk ${cy} present`)
      }
      for (const { pos, stateId } of blocks) {
        assert.strictEqual(loaded.getBlockStateId(pos), stateId, `block at ${pos.x},${pos.y},${pos.z}`)
      }
    }

    it(`keeps each sub chunk at its own height on ${version}`, async () => {
      const column = new ChunkColumn({ x: 1, z: -2 })
      const subChunkYs: number[] = []
      for (let cy = column.minCY; cy < column.maxCY; cy++) subChunkYs.push(cy)
      const blocks = subChunkYs.flatMap(cy => fillSubChunk(column, cy))
      assertSubChunks(await saveAndLoad(column), subChunkYs, blocks)
    })
  }
})
