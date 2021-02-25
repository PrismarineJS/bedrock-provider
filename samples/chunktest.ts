import { ChunkColumn } from './ChunkColumn'
import { Version } from './format'
const Block = require('prismarine-block')('1.16')

function test() {
  let cc = new ChunkColumn(Version.v1_4_0, 0, 0)

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        const id = Math.floor(Math.random() * 1000)
        let block = Block.fromStateId(id)
        // console.log('Block', block)

        cc.setBlock(x, y, z, block)

        const gotblock = cc.getBlock(x, y, z)
        // console.log('Block', gotblock)

        if (gotblock.type !== block.type && gotblock.type != 0)
          throw Error('mismatch ' + JSON.stringify(gotblock) + ',' + JSON.stringify(block))
      }
    }
  }

}


test()