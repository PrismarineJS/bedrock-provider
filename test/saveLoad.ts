import { WorldProvider, Version } from 'bedrock-provider'
import { LevelDB } from 'leveldb-zlib'
import { join } from 'path'
import assert from 'assert'
import Registry from 'prismarine-registry'
import PrismarineChunk from 'prismarine-chunk'
import fs from 'fs'

// Sub chunks have a key of their own since 0.17.0; prismarine-chunk gives 1.16 and 1.17 columns chunk version 1.16.0
const subChunkVersions = ['1.16.220', '1.17.10', '1.18.0', '1.19.1', '1.20.0', '1.21.0']

type Pos = { l: number, x: number, y: number, z: number }

describe('save and load', function () {
  for (const version of subChunkVersions) {
    const registry = Registry('bedrock_' + version)
    const ChunkColumn = PrismarineChunk(registry) as any
    const worldPath = join(__dirname, '/flat-save-load-' + version)
    const chunkVersion = new ChunkColumn({ x: 0, z: 0 }).chunkVersion
    const biomeIds = [1, 2, 4, 21] // plains, desert, forest, jungle
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

    async function saveAndLoad (column, full = false): Promise<any> {
      await wp.save(column.x, column.z, column)
      return await wp.load(column.x, column.z, full)
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

    it(`keeps the sub chunks above an empty one on ${version}`, async () => {
      // Empty sub chunks below the first one and between the others, like a floating island
      const column = new ChunkColumn({ x: 3, z: 4 })
      const subChunkYs = [column.minCY + 2, column.minCY + 5, column.maxCY - 1]
      const blocks = subChunkYs.flatMap(cy => fillSubChunk(column, cy))
      assertSubChunks(await saveAndLoad(column), subChunkYs, blocks)
    })

    it(`keeps the heightmap on ${version}`, async () => {
      const column = new ChunkColumn({ x: 2, z: -3 })
      // Heights above 255 too, so they don't fit in a byte
      const heights = new Uint16Array(256).map((_, i) => (i * 7) % 400)
      column.loadHeights(heights)
      const loaded = await saveAndLoad(column, true)
      assert.deepStrictEqual(Array.from(loaded.getHeights()), Array.from(heights))
    })

    if (chunkVersion < Version.v1_18_0) {
      it(`keeps the 2D biomes on ${version}`, async () => {
        // Not at 0,0, so biomes read for another column are caught
        const column = new ChunkColumn({ x: -5, z: 7 })
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) column.setBiomeId({ x, y: 0, z }, biomeIds[(x + z) % biomeIds.length])
        }
        const loaded = await saveAndLoad(column, true)
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            assert.strictEqual(loaded.getBiomeId({ x, y: 0, z }), biomeIds[(x + z) % biomeIds.length], `biome at ${x},${z}`)
          }
        }
      })
    }
  }
})
