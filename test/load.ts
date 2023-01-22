import { LevelDB } from 'leveldb-zlib'
import { WorldProvider } from 'bedrock-provider'
import bp from 'bedrock-protocol'
import bedrockServer from 'minecraft-bedrock-server'
import PrismarineRegistry from 'prismarine-registry'
import PrismarineChunk, { BedrockChunk, BlobEntry, BlobType } from 'prismarine-chunk'
import { once } from 'events'
import assert from 'assert'
import { join } from 'path'

import fs from 'fs'
import BlobStore from './util/BlobStore'
import getPort from './util/getPort'
const { setTimeout: sleep } = require('timers/promises')

const serialize = obj => JSON.stringify(obj, (k, v) => typeof v?.valueOf?.() === 'bigint' ? v.toString() : v)

const versions = ['1.16.220', '1.17.10', '1.18.0', '1.18.11', '1.18.30', '1.19.1']

for (const version of versions) {
  const registry = PrismarineRegistry('bedrock_' + version)
  const ChunkColumn = PrismarineChunk(registry) as typeof BedrockChunk

  describe('loads over network ' + version, function () {
    this.timeout(160 * 1000)
    this.retries(2)
    let chunksWithCaching, chunksWithoutCaching

    it('can load from network', async function () {
      // Remove the true part for faster testing (only test disk, not network)
      const needToStartServer = !fs.existsSync('./bds-' + version)

      const blobStore = new BlobStore()

      if (needToStartServer) {
        const port = await getPort()
        const portV6 = await getPort()
        console.log('Server ran on port', port)
        const handle = await bedrockServer.startServerAndWait(version, 90000, { path: join(__dirname, './bds-' + version), 'server-port': port, 'server-portv6': portV6 })

        async function connect(cachingEnabled) {
          const client = bp.createClient({
            host: 'localhost',
            port: port,
            version,
            // @ts-ignore
            username: 'Bot' + Math.floor(Math.random() * 1000),
            skipPing: true,
            offline: true
          })

          client.on('join', () => {
            client.queue('client_cache_status', { enabled: cachingEnabled })
          })

          // this would go in pworld
          const ccs = {}
          let subChunkMissHashes = []
          let sentMiss = false
          let gotMiss = false
          let lostSubChunks = 0, foundSubChunks = 0
          after(() => {
            console.log(version, 'Lost number of invalid subchunks was', lostSubChunks, ', and found', foundSubChunks, 'with caching', cachingEnabled)
          })

          async function processLevelChunk(packet) {
            const cc = new ChunkColumn({ x: packet.x, z: packet.z })
            if (!cachingEnabled) {
              await cc.networkDecodeNoCache(packet.payload, packet.sub_chunk_count)
            } else if (cachingEnabled) {
              const misses = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
              if (!packet.blobs.hashes.length) return // no blobs

              client.queue('client_cache_blob_status', {
                misses: misses.length,
                haves: 0,
                have: [],
                missing: misses
              })

              if (packet.sub_chunk_count < 0) { // 1.18+
                for (const miss of misses) blobStore.addPending(miss, new BlobEntry({ type: BlobType.Biomes, x: packet.x, z: packet.z }))
              } else { // 1.17-
                const lastBlob = packet.blobs.hashes[packet.blobs.hashes.length - 1]
                for (const miss of misses) {
                  blobStore.addPending(miss, new BlobEntry({ type: miss === lastBlob ? BlobType.Biomes : BlobType.ChunkSection, x: packet.x, z: packet.z }))
                }
                sentMiss = true
              }

              blobStore.once(misses, async () => {
                // The things we were missing have now arrived
                const now = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
                fs.writeFileSync(
                  `fixtures/${version}/level_chunk CacheMissResponse ${packet.x},${packet.z}.json`,
                  serialize({ blobs: Object.fromEntries(packet.blobs.hashes.map(h => [h.toString(), blobStore.get(h).buffer])) })
                )
                assert.strictEqual(now.length, 0)

                client.queue('client_cache_blob_status', {
                  misses: 0,
                  haves: packet.blobs.hashes.length,
                  have: packet.blobs.hashes,
                  missing: []
                })

                gotMiss = true
              })
            }

            if (packet.sub_chunk_count < 0) { // 1.18.0+
              // 1.18+ handling, we need to send a SubChunk request
              const maxSubChunkCount = packet.highest_subchunk_count || 5 // field is set if sub_chunk_count=-2 (1.18.10+)

              if (registry.version['>=']('1.18.11')) {
                // We can send the request in one big load!
                const requests: object[] = []
                for (let i = 1; i < Math.min(maxSubChunkCount, 5); i++) requests.push({ dx: 0, dz: 0, dy: i })
                client.queue('subchunk_request', { origin: { x: packet.x, z: packet.z, y: 0 }, requests, dimension: 0 })
              } else if (registry.version['>=']('1.18')) {
                for (let i = 1; i < Math.min(maxSubChunkCount, 5); i++) {
                  client.queue('subchunk_request', { x: packet.x, z: packet.z, y: i, dimension: 0 })
                }
              }
            }

            ccs[packet.x + ',' + packet.z] = cc
          }

          async function loadCached(cc, x, y, z, blobId, extraData) {
            const misses = await cc.networkDecodeSubChunk([blobId], blobStore, extraData)
            subChunkMissHashes.push(...misses)

            for (const miss of misses) {
              blobStore.addPending(miss, new BlobEntry({ type: BlobType.ChunkSection, x, z, y }))
            }

            if (subChunkMissHashes.length >= 10) {
              sentMiss = true
              const r = {
                misses: subChunkMissHashes.length,
                haves: 0,
                have: [],
                missing: subChunkMissHashes
              }

              client.queue('client_cache_blob_status', r)
              subChunkMissHashes = []
            }

            if (misses.length) {
              const [missed] = misses
              // Once we get this blob, try again

              blobStore.once([missed], async () => {
                gotMiss = true
                fs.writeFileSync(
                  `fixtures/${version}/subchunk CacheMissResponse ${x},${z},${y}.json`,
                  serialize({ blobs: Object.fromEntries([[missed.toString(), blobStore.get(missed).buffer]]) })
                )
                // Call this again, ignore the payload since that's already been decoded
                const misses = await cc.networkDecodeSubChunk([missed], blobStore)
                assert(!misses.length, 'Should not have missed anything')
              })
            }
          }

          async function processSubChunk(packet) {
            if (packet.entries) { // 1.18.10+ handling
              for (const entry of packet.entries) {
                const x = packet.origin.x + entry.dx
                const y = packet.origin.y + entry.dy
                const z = packet.origin.z + entry.dz
                const cc = ccs[x + ',' + z]
                if (entry.result === 'success') {
                  foundSubChunks++
                  if (packet.cache_enabled) {
                    await loadCached(cc, x, y, z, entry.blob_id, entry.payload)
                  } else {
                    await cc.networkDecodeSubChunkNoCache(y, entry.payload)
                  }
                } else {
                  lostSubChunks++
                }
              }
            } else {
              if (packet.request_result !== 'success') {
                lostSubChunks++
                return
              }
              foundSubChunks++
              const cc = ccs[packet.x + ',' + packet.z]
              if (packet.cache_enabled) {
                await loadCached(cc, packet.x, packet.y, packet.z, packet.blob_id, packet.data)
              } else {
                await cc.networkDecodeSubChunkNoCache(packet.y, packet.data)
              }
            }
          }

          async function processCacheMiss(packet) {
            const acks = []
            for (const { hash, payload } of packet.blobs) {
              const name = hash.toString()
              blobStore.updatePending(name, { buffer: payload })
              acks.push(hash)
            }

            // Send back an ACK
            client.queue('client_cache_blob_status', {
              misses: 0,
              haves: acks.length,
              have: [],
              missing: acks
            })
          }

          client.on('level_chunk', processLevelChunk)
          client.on('subchunk', (sc) => processSubChunk(sc).catch(console.error))
          client.on('client_cache_miss_response', processCacheMiss)

          fs.mkdirSync(`fixtures/${version}/pchunk`, { recursive: true })
          client.on('packet', ({ data: { name, params }, fullBuffer }) => {
            if (name === 'level_chunk') {
              fs.writeFileSync(`fixtures/${version}/level_chunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z}.json`, serialize(params))
            } else if (name === 'subchunk') {
              if (params.origin) {
                fs.writeFileSync(`fixtures/${version}/subchunk ${cachingEnabled ? 'cached' : ''} ${params.origin.x},${params.origin.z},${params.origin.y}.json`, serialize(params))
              } else {
                fs.writeFileSync(`fixtures/${version}/subchunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z},${params.y}.json`, serialize(params))
              }
            }
          })

          console.log('Client awaiting spawn')
          await once(client, 'spawn')
          console.log('Client spawned')
          handle.stdin.write('op test\ngamemode creative @a\n')
          await sleep(100)

          // Summon a cow
          client.write('command_request', {
            command: `/summon cow ~2 ~2 ~2`,
            origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
            interval: false
          })

          // Set a block entity
          client.write('command_request', {
            command: `/setblock ~2 10 ~ minecraft:barrel`,
            origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
            interval: false
          })
          await sleep(2600)

          // Set a portal block to go to nether and place a block to force a chunk save
          client.write('command_request', {
            command: `/setblock ~ ~ ~ portal`,
            origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
            interval: false
          })
          console.log('Set portal!')
          await sleep(1000)
          client.write('command_request', {
            command: `/setblock ~2 10 ~ minecraft:barrel`,
            origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
            interval: false
          })


          await sleep(500)
          handle.stdin.write('save hold\n')
          await sleep(1000)
          handle.stdin.write('save query\n')
          await sleep(1000)
          // handle.stdin.write('save resume\n')
          // await sleep(500)
          client.close()

          if (cachingEnabled) {
            assert(sentMiss, 'Should have sent a MISS')
            assert(gotMiss, 'Should have got a MISS response')
            chunksWithCaching = ccs
          } else {
            chunksWithoutCaching = ccs
          }
        }

        await connect(false)
        console.log('✅ Without caching')
        await connect(true)
        console.log('✅ With caching')

        if (process.env.CI) {
          console.log('▶️ Running CI pass without caching')
          // CI can act weird, so let's run this again without caching
          await connect(false)
          console.log('✅ CI second run without caching')
        }

        handle.stdin.write('stop\n')
        await sleep(1500)
        await handle.kill()
      }
    })

    it('client loaded at least one chunk with block entities inside', async function () {
      const fixtureFiles = fs.readdirSync(`fixtures/${version}/`)
      console.log('Reading', Object.keys(chunksWithCaching).length, 'cached chunks and', Object.keys(chunksWithoutCaching).length, 'uncached')
      let found = false
      for (const [k, columns] of Object.entries({ cached: chunksWithCaching, uncached: chunksWithoutCaching })) {
        if (!columns) continue
        let has = false
        for (const key in columns) {
          const column = columns[key]
          if (Object.values(column.blockEntities).length > 0) {
            console.log('Found a column with block entities at', key)
            for (let i = -4; i < 16; i++) {
              if (column.getSectionBlockEntities(i).length) {
                console.log('=> section with block entities at y=', i)
              }
            }
            has = true, found = true
            // Copy over this test file into "pchunk" folder that can be used to test prismarine-chunk
            for (const fixFile of fixtureFiles) {
              if (fixFile.includes(key)) {
                fs.copyFileSync(`fixtures/${version}/${fixFile}`, `fixtures/${version}/pchunk/${fixFile}`)
              }
            }
          }
        }
        // Too flaky to do this check here (time related), so we do it at top level irrespective of caching
        // assert(has, 'Block entity column not found with ' + k)
      }
      assert(found, 'Block entity column not found')
    })
  })

  describe('loads from disk ' + version, function () {
    this.timeout(120 * 1000)
    let db: LevelDB, wp: WorldProvider

    it('can load from disk', async function () {
      db = new LevelDB(join(__dirname, './bds-') + version + '/worlds/Bedrock level/db')
      await db.open()
      wp = new WorldProvider(db, { dimension: 0, registry })

      let max = 10
      let foundStone = false
      const keys = await wp.getKeys()
      let seenChunks = 0

      for (const key of keys) {
        if (max <= 0) break
        if (key.type === 'chunk' && key.dim === 0) {
          const chunk = await wp.getChunk(key.x, key.z)
          seenChunks++

          ok:
          for (let x = 0; x <= 16; x++) {
            for (let z = 0; z <= 16; z++) {
              for (let y = chunk.minCY; y <= chunk.maxCY; y++) {
                const block = chunk.getBlock({ x, y, z })
                if (block.name.includes('stone')) {
                  foundStone = true
                  break ok
                }
              }
            }
          }

          const blocks = chunk.getBlocks()
          console.log('Blocks:', blocks.map(block => block.name.replace('minecraft:', '')).slice(0, 10).join(', '))
          max--
        }
      }

      assert(foundStone, 'Did not find stone')
    })

    it('found entities and block entities', async () => {
      const keys = await wp.getKeys()

      let foundEntityCount = 0, foundBlockEntityCount = 0

      for (const key of keys) {
        if (key.type === 'chunk' && key.dim === 0) {
          const chunk = await wp.getChunk(key.x, key.z)
          // console.log('Loaded chunk', chunk)
          const entities = chunk.entities
          const blockEntities = chunk.blockEntities
          if (Object.keys(entities).length) foundEntityCount++
          if (Object.keys(blockEntities).length) foundBlockEntityCount++
        }
      }

      console.log('Found', foundEntityCount, 'entities and', foundBlockEntityCount, 'block entities')
      assert(foundEntityCount, 'Did not find any entities')
      assert(foundBlockEntityCount, 'Did not find any block entities')
    })

    it('can load nether chunks', async function () {
      const wp = new WorldProvider(db, { dimension: 1, registry })
      const keys = await wp.getKeys()

      let foundNetherChunk = false, foundNetherBlocks = false

      for (const key of keys) {
        if (key.type === 'chunk' && key.dim === 1) {
          const chunk = await wp.getChunk(key.x, key.z)
          const blocks = chunk.getBlocks()
          foundNetherChunk = true
          for (const block of blocks) {
            if (block.name.includes('netherrack') || block.name.includes('lava') || block.name.includes('soul') || block.name.includes('basalt') || block.name.includes('blackstone')) {
              foundNetherBlocks = true
              break
            }
          }
        }
      }

      assert(foundNetherChunk, 'Did not find any nether chunks')
      assert(foundNetherBlocks, 'Did not find any nether blocks')
    })

    after(() => {
      db.close()
    })

    // TODO: Re-encode tests...
  })
}
