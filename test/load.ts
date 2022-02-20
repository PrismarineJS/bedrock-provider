// var SegfaultHandler = require('segfault-handler');
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
const { setTimeout: sleep } = require('timers/promises')

const serialize = obj => JSON.stringify(obj, (k, v) => typeof v?.valueOf?.() === 'bigint' ? v.toString() : v)

const versions = ['1.16.220', '1.17.10', '1.18.0']

for (const version of versions) {
  const registry = PrismarineRegistry('bedrock_' + version)
  const ChunkColumn = PrismarineChunk(registry) as typeof BedrockChunk

  describe('loads over network ' + version, function () {
    this.timeout(Infinity)
    let chunksWithCaching, chunksWithoutCaching

    it('can load from network', async function () {
      // Remove the true part for faster testing (only test disk, not network)
      const needToStartServer = !fs.existsSync('./bds-' + version)

      const blobStore = new BlobStore()

      if (needToStartServer) {
        const port = 19132 + Math.floor(Math.random() * 100)
        console.log('Server ran on port', port)
        const handle = await bedrockServer.startServerAndWait(version, 90000, { path: join(__dirname, './bds-' + version), 'server-port': port, 'server-portv6': port + 1 })

        async function connect(cachingEnabled) {
          const client = bp.createClient({
            host: 'localhost',
            port: port,
            version,
            // @ts-ignore
            username: 'Notch',
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

            if (packet.sub_chunk_count === -1) { // 1.18.0
              // 1.18+ handling, we need to send a SubChunk request
              if (registry.version['>=']('1.18.11')) {
                throw new Error('Not yet supported')
              } else if (registry.version['>=']('1.18')) {
                for (let i = 1; i < 5; i++) {
                  client.queue('subchunk_request', { x: packet.x, z: packet.z, y: i })
                }
              }
            }

            ccs[packet.x + ',' + packet.z] = cc
          }

          async function processSubChunk(packet) {
            const cc = ccs[packet.x + ',' + packet.z]

            if (packet.entries) { // 1.18.10+ handling
              // TODO...
            } else {
              if (!cachingEnabled) {
                await cc.networkDecodeSubChunkNoCache(packet.y, packet.data)
              } else {
                const misses = await cc.networkDecodeSubChunk([packet.blob_id], blobStore, packet.data)
                subChunkMissHashes.push(...misses)

                for (const miss of misses) {
                  blobStore.addPending(miss, new BlobEntry({ type: BlobType.ChunkSection, x: packet.x, z: packet.z, y: packet.y }))
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
                      `fixtures/${version}/subchunk CacheMissResponse ${packet.x},${packet.z},${packet.y}.json`,
                      serialize({ blobs: Object.fromEntries([[missed.toString(), blobStore.get(missed).buffer]]) })
                    )
                    // Call this again, ignore the payload since that's already been decoded
                    const misses = await cc.networkDecodeSubChunk([missed], blobStore)
                    assert(!misses.length, 'Should not have missed anything')
                  })
                }
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

          // client.on('level_chunk', processLevelChunk)
          // client.on('subchunk', processSubChunk)
          // client.on('client_cache_miss_response', processCacheMiss)

          // fs.mkdirSync(`fixtures/${version}/pchunk`, { recursive: true })
          // client.on('packet', ({ data: { name, params }, fullBuffer }) => {
          //   if (name === 'level_chunk') {
          //     fs.writeFileSync(`fixtures/${version}/level_chunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z}.json`, serialize(params))
          //   } else if (name === 'subchunk') {
          //     fs.writeFileSync(`fixtures/${version}/subchunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z},${params.y}.json`, serialize(params))
          //   }
          // })

          // console.log('Client awaiting spawn')
          await once(client, 'join')
          client.close()
          // console.log('Client spawned')
          // handle.stdin.write('op test\ngamemode creative @a\n')
          // await sleep(100)
          // // Set a block entity
          // client.write('command_request', {
          //   command: `/setblock ~2 10 ~ minecraft:barrel`,
          //   origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
          //   interval: false
          // })
          // await sleep(500)
          // // // Set a normal block
          // client.write('command_request', {
          //   command: `/setblock ~2 ~10 ~ minecraft:diamond_block`,
          //   origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
          //   interval: false
          // })
          // await sleep(500)
          // handle.stdin.write('save hold\n')
          // await sleep(1000)
          // handle.stdin.write('save query\n')
          // await sleep(1000)
          // // handle.stdin.write('save resume\n')
          // await sleep(500)

          // if (cachingEnabled) {
          //   assert(sentMiss, 'Should have sent a MISS')
          //   assert(gotMiss, 'Should have got a MISS response')
          //   chunksWithCaching = ccs
          // } else {
          //   chunksWithoutCaching = ccs
          // }
        }

        for (let i = 0; i < 50; i++) {
          await connect(false)
          console.log('✅ Without caching', i)
          await connect(true)
          console.log('✅ With caching', i)
        }

        handle.stdin.write('stop\n')
        await sleep(1500)
        await handle.kill()
      }
    })

    it('client loaded at least one chunk with block entities inside', async function () {
      const fixtureFiles = fs.readdirSync(`fixtures/${version}/`)
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
            has = true
            // Copy over this test file into "pchunk" folder that can be used to test prismarine-chunk
            for (const fixFile of fixtureFiles) {
              if (fixFile.includes(key)) {
                fs.copyFileSync(`fixtures/${version}/${fixFile}`, `fixtures/${version}/pchunk/${fixFile}`)
              }
            }
          }
        }
        assert(has, 'Block entity column not found with ' + k)
      }
    })
  })

  describe('loads from disk ' + version, function () {
    return
    this.timeout(120 * 1000)
    let db: LevelDB, wp: WorldProvider

    it('can load from disk', async function () {
      db = new LevelDB(join(__dirname, './bds-') + version + '/worlds/Bedrock level/db')
      await db.open()
      wp = new WorldProvider(db, { dimension: 0 })

      let max = 10
      let foundStone = false
      const keys = await wp.getKeys()
      let seenChunks = 0

      for (const key of keys) {
        if (max <= 0) break
        if (key.type === 'chunk') {
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
          console.log('Blocks', blocks.map(block => block.name))
          max--
        }
      }

      assert(foundStone, 'Did not find stone')
    })

    it('found entities and block entities', async () => {
      const keys = await wp.getKeys()

      let foundEntityCount = 0, foundBlockEntityCount = 0

      for (const key of keys) {
        if (key.type === 'chunk') {
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

    // TODO: Re-encode tests...
  })
}
