// process.env.DEBUG = 'minecraft-protocol'
import { LevelDB } from 'leveldb-zlib'
import { WorldProvider } from 'bedrock-provider'
import bp from 'bedrock-protocol'
import bedrockServer from 'minecraft-bedrock-server'
import { once } from 'events'
import assert from 'assert'
import { join } from 'path'
const { setTimeout: sleep } = require('timers/promises')

const versions = ['1.16.220', '1.18.0']

// function describe(name: string, fn: () => void) {
//   console.log(name)
//   fn()
// }

// async function it(name: string, fn: () => void) {
//   console.log('  ' + name)
//   await fn()
// }

for (const version of versions) {
  describe('new world in ' + version, function () {
    it('can load', async function () {
      console.log('./bds-' + version)
      const handle = await bedrockServer.startServerAndWait(version, 90000, { path: join(__dirname, './bds-' + version), 'server-port': 19132 })
      const client = bp.createClient({
        host: 'localhost',
        port: 19132,
        version,
        // @ts-ignore
        username: 'Notch',
        offline: true
      })

      await once(client, 'spawn')
      
      handle.stdin.write('op test\ngamemode creative @a\n')
      await sleep(100)
      client.write('command_request', {
        command: '/setblock ~2 ~10 ~ minecraft:diamond_block',
        origin: { type: 'player', uuid: 'fd8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', request_id: '' },
        interval: false
      })
      await sleep(500)
      handle.stdin.write('save hold\n')
      await sleep(500)
      client.close()
      await handle.kill()
      const db = new LevelDB(join(__dirname, './bds-') + version + '/worlds/Bedrock level/db')
      await db.open()
      const wp = new WorldProvider(db, { dimension: 0 })

      let max = 10
      let foundStone = false
      console.log('Running')
      const keys = await wp.getKeys()
      console.log(keys)
      let seenChunks = 0
      let kk
      for (const key of keys) {
        if (max <= 0) break
        // if (foundStone) break
        if (key.type === 'chunk') {
          console.log('Reading chunk at', key.x, key.z)
          const chunk = await wp.getChunk(key.x, key.z)
          seenChunks++
          console.log('Got chunk', chunk)
          ok:
          for (let x = 0; x <= 16; x++) {
            for (let z = 0; z <= 16; z++) {
              for (let y = chunk.minY; y <= chunk.maxY; y++) {
                const block = chunk.getBlock({ x, y, z })
                if (block.name.includes('stone')) {
                  // console.log('Found stone at', x, y, z, block)
                  foundStone = true
                  break ok
                }
              }
            }
          }

          const blocks = chunk.getBlocks()
          console.log('Blocks', blocks)

          max--
        }
      }

      assert(foundStone, 'Did not find stone')

      console.log('Seen chunks', seenChunks)
    })
  })
  // break
}
