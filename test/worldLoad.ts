import { LevelDB } from 'leveldb-zlib'
import { WorldProvider } from 'bedrock-provider'
import bp from 'bedrock-protocol'
import bedrockServer from 'minecraft-bedrock-server'
import PrismarineRegistry from 'prismarine-registry'
import PrismarineChunk, { BedrockChunk } from 'prismarine-chunk'
import { BlobEntry, BlobType } from 'prismarine-chunk/src/bedrock/common/BlobCache'
import { once } from 'events'
import assert from 'assert'
import { join } from 'path'

import fs from 'fs'
import BlobStore from './util/BlobStore'
const { setTimeout: sleep } = require('timers/promises')


const versions = ['1.16.220', '1.17.10', '1.18.0']
// const versions = []
for (const version of versions) {
  describe('new world in ' + version, function () {
    this.timeout(120 * 1000)
    const registry = PrismarineRegistry('bedrock_' + version)
    const ChunkColumn = PrismarineChunk(registry) as typeof BedrockChunk
    it('can load from network', async function () {
      // console.log('./bds-' + version)
      const needToStartServer = !fs.existsSync('./bds-' + version) || true

      const blobStore = new BlobStore()

      if (needToStartServer) {
        const port = 19132 + Math.floor(Math.random() * 1000)
        // console.log('Server port', port)
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
            // console.log('Client got level_chunk', packet)
            const cc = new ChunkColumn({ x: packet.x, z: packet.z })
            if (!cachingEnabled) {
              await cc.networkDecodeNoCache(packet.payload, packet.sub_chunk_count)
            } else if (cachingEnabled) {
              const misses = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
              // console.log('MISSes', misses.map(e => e.valueOf().toString()))
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

                // console.log('Pending chunks/biomes', packet.x, packet.z, packet.blobs.hashes.length, packet.blobs.hashes)
                blobStore.once(misses, async () => {
                  // console.log('Got all blobs for chunk', packet.x, packet.z)
                  // The things we were missing have now arrived
                  const now = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
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
            }

            if (packet.sub_chunk_count === -1) { // 1.18.0
              // 1.18+ handling, we need to send a SubChunk request
              if (false && registry.version['>=']('1.18.10')) {
                throw new Error('Not yet supported')
              } else if (registry.version['>=']('1.18')) {
                client.queue('subchunk_request', { x: packet.x, z: packet.z, y: 0 })
              }
            }

            ccs[packet.x + ',' + packet.z] = cc
          }

          async function processSubChunk(packet) {
            // console.log('Client got subchunk', packet)
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
                  // console.log('Requesting missing chunks ', r)
                  client.queue('client_cache_blob_status', r)
                  subChunkMissHashes = []
                }

                if (misses.length) {
                  const [missed] = misses
                  // Once we get this blob, try again
                  // console.log('Listening', missed.toString())

                  blobStore.once([missed], async () => {
                    gotMiss = true
                    // console.log('Got a MISSed packet', missed)
                    const misses = await cc.networkDecodeSubChunk([missed], blobStore, packet.data)
                    // console.log('Miss?', misses, blobStore)
                    assert(!misses.length, 'Should not have missed anything')
                  })
                }
              }
            }
          }

          async function processCacheMiss(packet) {
            // console.log('Got MISS response', packet)
            const acks = []
            for (const { hash, payload } of packet.blobs) {
              const name = hash.toString()
              blobStore.updatePending(name, { buffer: payload })

              client.emit(hash.toString())
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
          client.on('subchunk', processSubChunk)
          client.on('client_cache_miss_response', processCacheMiss)

          console.log('Client awaiting spawn')
          await once(client, 'spawn')
          console.log('Client spawned')
          handle.stdin.write('op test\ngamemode creative @a\n')
          await sleep(100)
          for (let i = 0; i < 10; i++) {
            client.write('command_request', {
              command: `/setblock ~2 ~10 ~${i} minecraft:diamond_block`,
              origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
              interval: false
            })
            await sleep(100)
          }
          await sleep(500)
          handle.stdin.write('save hold\n')
          await sleep(1000)
          handle.stdin.write('save query\n')
          await sleep(1000)
          handle.stdin.write('save resume\n')
          await sleep(500)
          client.close()

          if (cachingEnabled) {
            assert(sentMiss, 'Should have sent a MISS')
            assert(gotMiss, 'Should have got a MISS response')
          }
        }

        await connect(false)
        console.log('✅ Without caching')
        await connect(true)
        console.log('✅ With caching')

        handle.stdin.write('stop\n')
        await sleep(1500)
        await handle.kill()
      }
    })

    it('can load from disk', async function () {
      const db = new LevelDB(join(__dirname, './bds-') + version + '/worlds/Bedrock level/db')
      await db.open()
      const wp = new WorldProvider(db, { dimension: 0 })

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
  })
}
