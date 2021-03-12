// @ts-nocheck
const PBlock = require('prismarine-block')

var data = {}

let NEXT_RUNTIME_ID = 20000

/**
 * 
 * In this factory, we convert Bedrock Block palette entries, which
 * are stored in NBT and have a schema like such:
 * 
 * { "type": "compound", "name": "", "value": { "name": { "type": "string", "value": "minecraft:bedrock" }, "states": { "type": "compound", "value": { "infiniburn_bit": { "type": "byte", "value": 0 } } }, "version": { "type": "int", "value": 17825808 } } }
 * 
 * to Runtime IDs which are used internaly to represent entries in
 * the global block palette. To convert a block state string like:
 * minecraft:door[facing=west,half=bottom] to runtime ID 6996
 * for example, first the NBT data needs to be stringified
 * into a Bedrock BlockState String (BSS) like the example, then
 * this must be checked against a precomputed map to get the Bedrock RuntimeID (BRID).
 * 
 * The BRID is an index to the global block palette which is hard-coded for
 * every version of Minecraft. The global palette is in ../data/BlockStates_$ver.json
 * 
 * We also need to have a map to map BRIDs to Java Block State IDs
 * 
 * When getBlock(pos, ver = '1.16.1') is called:
 *  - the BRID is pulled from the block array
 *  - the BRID is then converted to a Java Block State ID (via data.brid2jsid)
 *  - we then call Block.fromStateID() to return a prismarine-block
 *  - we attach the bedrock block state info (NBT, BRID) onto the prismarine-block
 *  - if the map process fails, we return our own class with just NBT/BRID for bedrock
 * 
 * When setBlock(pos, block, ver?) is called:
 * This is super confusing and hacky but no easy way around it:
 * because prismarine-block does not have version info attached
 * to the block objects, we have to do guesswork to figure out if
 * these blocks are 1.13 or earlier.
 * IF the block has states:
 *  - the block is transformed into a Java Block State String (JSS)
 *  - the JSS is mapped to a BRID
 *  - the BRID is stored in block array & added to global palette
 * ELSE:
 *  - we map the legacy block to a new block (same as prismarine-schematic/lib/legacy.json)
 * getBlock() and setBlock() methods 
 *  
 */

const Block1_16_1 = PBlock('1.16.1')

// Maps game version with NBT version
const VERSION_MAP = {
  '1.16.200': '17825808'
}

const LATVER = VERSION_MAP["1.16.200"]

export class BlockFactory {
  static initialize(gameVersion) {
    const nbtVersion = VERSION_MAP[gameVersion]
    if (!nbtVersion) throw Error('Unknown game ver : ' + gameVersion)
    const Block = PBlock('1.16.1')

    const root = __dirname + `/../data/${gameVersion}/`

    data[nbtVersion] = {
      brid2bss: require(root + 'blocks/BRID.json'),
      bss2brid: require(root + 'blocks/BSS.json'),
      blockstates: require(root + 'blocks/BlockStates.json'),
      jss2brid: require(root + 'blocks/J2BRID.json'),
      brid2jsid: require(root + 'blocks/J2BRID.json'),
      jsid2brid: []
    }
    data[nbtVersion].blockstatesLen = data[nbtVersion].blockstates.length

    let javaBlocks = require(root + '../Block_Java_116.json')

    let maxStateId = javaBlocks[javaBlocks.length - 1].maxStateId
    let a = []
    let jsid2brid = []

    for (let i = 0; i < maxStateId; i++) {
      let block = Block.fromStateId(i)
      let props = block.getProperties()
      let bss = this.buildBSS('minecraft:' + block.name, props)
      // console.log('bss', bss, data[version].jss2brid[bss])
      jsid2brid.push(data[nbtVersion].jss2brid[bss])
      a.push(bss)
    }
    data[nbtVersion].jsid2brid = jsid2brid
    for (let i = 0; i < jsid2brid.length; i++) {
      let brid = jsid2brid[i]
      data[nbtVersion].brid2jsid[brid] = i
      // if (!brid) console.log(brid, i)
      // this.nextRuntimeID()
    }
  }

  static buildBSS(name, states) {
    if (states.type == 'compound') {
      // un-NBT ify 
      states = states.value
    }
    let str = ''
    for (var key of Object.keys(states).sort()) {
      let val = states[key].value !== undefined ? states[key].value : states[key]
      if (val == 'true') val = 1
      if (val == 'false') val = 0
      str += key + '=' + val + ','
    }
    let bss = name + '[' + (str.endsWith(',') ? str.slice(0, -1) : str) + ']'
    return bss
  }

  static nextRuntimeID(name, states, bss, version) {
    data[version].bss2brid[bss] = NEXT_RUNTIME_ID
    data[version].brid2bss[NEXT_RUNTIME_ID] = { b: bss }
    data[version].blockstates[NEXT_RUNTIME_ID] = states
    return NEXT_RUNTIME_ID++
  }


  static getSimilarRuntimeID(name, version) {
    let bsses = data[version].bss2brid
    for (const bsso in bsses) {
      if (bsso.startsWith(`${name}[`)) {
        return bsses[bsso]
      }
    }
    return -1
  }

  static getRuntimeID(name, states, version): number {
    // console.trace('getRuntimeID', name, states, version)
    let bss = this.buildBSS(name, states)
    version = version || LATVER
    if (!data[version]) {
      this.initialize(version)
    }
    console.assert(data[version])
    let a1 = data[version].bss2brid[bss]
    if (!a1) {
      console.warn('Did not find ', name, states, version, bss)
      return this.nextRuntimeID(name, states, bss, version)
    }
    return a1
  }

  static getBlockState(runtimeID) {
    // console.log('R', runtimeID, data[LATVER].blockstates[runtimeID])
    return data[LATVER].blockstates[runtimeID]?.value
  }

  static getBlockStateCount() {
    return data[LATVER].blockstatesLen
  }

  static getBRIDFromJSID(jsid) {
    return data[LATVER].jsid2brid[jsid] || 0
  }

  static getJSIDFromBRID(brid) {
    return data[LATVER].brid2jsid[brid] || 0
  }

  static getPBlockFromStateID(jsid) {
    return Block1_16_1.fromStateId(jsid)
  }
}

BlockFactory.initialize('1.16.200')

function test() {
  console.log(Block1_16_1)
  BlockFactory.initialize('1.16.200')

  let ret = []
  // for (let i = 0; i < 10000; i++) {
  //   ret.push(JSON.stringify(BlockFactory.getBlockState(i)))
  // }
  // console.log(ret)

  // ret = []
  // for (let i = 0; i < 10000; i++) {
  //   ret.push(BlockFactory.getBRIDFromJSID(i))
  // }
  // console.log(ret)

  // ret = []
  // for (let i = 0; i < BlockFactory.getBlockStateCount(); i++) {
  //   let jsid = BlockFactory.getJSIDFromBRID(i)
  //   if (jsid == 0) console.log(JSON.stringify(BlockFactory.getBlockState(i)))
  //   ret.push(jsid)
  // }
  // console.log(ret)

  ret = []
  for (let i = 0; i < 10000; i++) {
    ret.push(BlockFactory.getPBlockFromStateID(i))
  }
  console.log(ret)
}

// test()