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

import { Block } from "prismarine-block"
import { join } from 'path'

const PBlock = require('prismarine-block')
const versions = require('../data/versions.json')
export const latestVersion = versions[versions.length - 1][0]

type int = number //todo: AssemblyScript

// See if we have mappings for this version - if not, return the a version we support closest to the dataVersion
export function hasVersion(dataVersion) {
  for (const [gver, dver] of versions) {
    if (dver === dataVersion) return [gver, dver]
  }

  for (const [_gameVersion, _dataVersion] of versions) {
    if (_dataVersion >= dataVersion) {
      return [_gameVersion, _dataVersion]
    }
  }
  console.log(versions)
  throw Error('Unknown version : ' + dataVersion)
}


// Converts numeric version to string version and vice-versa... easier for us to work with
export function getVersion(version: int | string): { str: string, int: int } {
  if (typeof version === 'number') {
    const major = (version >> 24) & 0xFF
    const minor = (version >> 16) & 0xFF
    const patch = (version >> 8) & 0xFF
    const build = (version) & 0xFF
    return { str: `${major}.${minor}.${patch}`, int: version }
  } else {
    const [major, minor, patch, build] = version.split('.')
    // @ts-ignore : these are strings but get turned to numbers when shifting :)
    const v = (major << 24) | (minor << 16) | (patch << 8) | (build || 0)
    return { str: version, int: v }
  }
}

export class BlockFactory {
  // When a block is not found in the global palette, it is inserted into the global palette starting at this index
  _nextRuntimeID = 20000

  data: {
    [key: string]: {
      // Bedrock Runtime ID to Bedrock Block State string
      brid2bss?: { j: string, b: string }[],
      // Bedrock Block state string to Bedrock Runtime ID
      bss2brid?: { [key: string]: int },
      // Same as above but for Java block state strings
      jss2brid?: { [key: string]: int },

      // Bedrock Runtime ID to Java state ID - this is generated at runtime
      brid2jsid?: { [key: number]: int },
      jsid2brid?: { [key: number]: int }, // reversed map of above

      // This holds the block runtime ID global palette from the vanilla game 
      blockstates?: any[]
    }
  } = {}
  Block: Block

  defaultDataVersion: number

  constructor(pblockVersion?: string, dataVersion?: number) {
    this.setPBlockVersion(pblockVersion)
    this.initialize(latestVersion)
    this.defaultDataVersion = dataVersion || latestVersion
  }

  setPBlockVersion(version?: string) {
    // default to latest p-block
    const pver = PBlock.testedVersions[PBlock.testedVersions.length - 1]
    this.Block = PBlock(version || pver)
  }

  initialize(bedrockVersion: int | string) {
    let { str: gameVersion, int: dataVersion } = getVersion(bedrockVersion)
    // console.log('Version', dataVersion, gameVersion)
    if (!gameVersion || !dataVersion) throw Error('Unknown game ver : ' + bedrockVersion)

    const have = hasVersion(dataVersion)
    let alias
    if (!this.data[gameVersion]) {
      alias = gameVersion
      gameVersion = have[0]
      // console.log('ALIAS',alias, '->', gameVersion)
    }
    // console.log(gameVersion, have, this.data[gameVersion])

    if (this.data[gameVersion]) {
      if (alias) this.data[alias] = this.data[gameVersion]
      return // Already initialized
    }
    const root = join(__dirname, `../data/${gameVersion}/`)
    this.data[gameVersion] = {
      brid2bss: require(root + 'blocks/BRID.json'),
      bss2brid: require(root + 'blocks/BSS.json'),
      blockstates: require(root + 'blocks/BlockStates.json'),
      jss2brid: require(root + 'blocks/J2BRID.json'),
      brid2jsid: require(root + 'blocks/J2BRID.json'),
      jsid2brid: []
    }
    if (alias) this.data[alias] = this.data[gameVersion]

    // CACHE SOME MAPS
    // optimization for quick conversion

    const javaBlocks = require(root + '../Block_Java_116.json')
    const maxStateId = javaBlocks[javaBlocks.length - 1].maxStateId
    const a = []
    const jsid2brid = []

    for (let i = 0; i < maxStateId; i++) {
      let block = this.Block.fromStateId(i, 0)
      let props = block.getProperties()
      let bss = BlockFactory.buildBSS('minecraft:' + block.name, props)
      // console.log('bss', bss, data[version].jss2brid[bss])
      jsid2brid.push(this.data[gameVersion].jss2brid[bss])
      a.push(bss)
    }
    this.data[gameVersion].jsid2brid = jsid2brid
    for (let i = 0; i < jsid2brid.length; i++) {
      let brid = jsid2brid[i]
      this.data[gameVersion].brid2jsid[brid] = i
      // if (!brid) console.log(brid, i)
      // this.nextRuntimeID()
    }
  }

  get latestVersion() {
    return this.defaultDataVersion
  }

  static buildBSS(name, states) {
    if (states.type == 'compound') {
      // remove nbt encapsulation
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

  get(version: string | int) {
    if (!version) { version = this.latestVersion }
    // When parsing chunk data, Minecraft stores the game version as a integer. We need to convert that to a string for internal use.
    // Create a refrence if not already exists between numeric+string version data.
    // console.log('GET',version,this.latestVersion)
    this.data[version] ??= this.data[getVersion(version).str]
    return this.data[version]
  }

  nextRuntimeID(name: string, states, bss: string, version?) {
    this.get(version).bss2brid[bss] = this._nextRuntimeID
    this.get(version).brid2bss[this._nextRuntimeID] = { b: bss, j: undefined }
    this.get(version).blockstates[this._nextRuntimeID] = states
    return this._nextRuntimeID++
  }

  getSimilarRuntimeID(name: string, version?) {
    let bsses = this.get(version).bss2brid
    for (const bsso in bsses) {
      if (bsso.startsWith(`${name}[`)) {
        return bsses[bsso]
      }
    }
    return -1
  }

  getRuntimeID(name: string, states, version?): int {
    let bss = BlockFactory.buildBSS(name, states)
    if (!this.get(version)) {
      // console.log('init',name,states,version)
      this.initialize(version)
    }
    let a1 = this.get(version).bss2brid[bss]
    if (!a1) {
      console.warn('Did not find ', name, states, version, bss)
      return this.nextRuntimeID(name, states, bss, version)
    }
    return a1
  }

  getBlockState(runtimeID: int, version?) {
    // console.log('R', runtimeID, data[LATVER].blockstates[runtimeID])
    // console.log(this.data, version)
    return this.get(version).blockstates[runtimeID]?.value
  }

  getBlockStateCount(version?) {
    return this.get(version).blockstates.length
  }

  getBRIDFromJSID(jsid: int, version?) {
    return this.get(version).jsid2brid[jsid] || 0
  }

  getJSIDFromBRID(brid: int, version?) {
    return this.get(version).brid2jsid[brid] || 0
  }

  getPBlockFromStateID(jsid: int, version?) {
    return this.Block.fromStateId(jsid, 0) // TODO: biomes
  }
}

// Expor a default instance
export const blockFactory = new BlockFactory()

function test() {
  const blockFactory = new BlockFactory('1.16.1')

  let ret = []
  for (let i = 0; i < 10000; i++) {
    ret.push(JSON.stringify(blockFactory.getBlockState(i)))
  }
  console.log(ret)

  ret = []
  for (let i = 0; i < 10000; i++) {
    ret.push(blockFactory.getBRIDFromJSID(i))
  }
  console.log(ret)

  ret = []
  for (let i = 0; i < blockFactory.getBlockStateCount(); i++) {
    let jsid = blockFactory.getJSIDFromBRID(i)
    if (jsid == 0) console.log(JSON.stringify(blockFactory.getBlockState(i)))
    ret.push(jsid)
  }
  console.log(ret)

  ret = []
  for (let i = 0; i < 10000; i++) {
    ret.push(blockFactory.getPBlockFromStateID(i))
  }
  console.log(ret)
}

// test()