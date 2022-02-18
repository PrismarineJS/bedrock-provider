# bedrock-provider
[![NPM version](https://img.shields.io/npm/v/bedrock-provider.svg)](http://npmjs.com/package/bedrock-provider)
[![Build Status](https://github.com/PrismarineJS/bedrock-provider/workflows/CI/badge.svg)](https://github.com/PrismarineJS/bedrock-provider/actions?query=workflow%3A%22CI%22)
[![Discord](https://img.shields.io/badge/chat-on%20discord-brightgreen.svg)](https://discord.gg/GsEFRM8)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-brightgreen.svg)](https://gitter.im/PrismarineJS/general)
[![Irc](https://img.shields.io/badge/chat-on%20irc-brightgreen.svg)](https://irc.gitter.im/)
[![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/bedrock-provider)

Minecraft Bedrock level provider for loading and storing worlds on disk

## Install

```js
npm i bedrock-provider
```

## Usage

Writing example:

```js
const fs = require('fs')
const { LevelDB } = require('leveldb-zlib')
const { WorldProvider } = require('bedrock-provider')
const registry = require('prismarine-registry')('bedrock_1.17.10')
const Block = require('prismarine-block')(registry)
const ChunkColumn = require('prismarine-chunk')(registry)

async function main() {
  const cc = new ChunkColumn({ x: 0, z: 0 })
  cc.setBlock({ x: 0, y: 1, z: 0 }, Block.fromStateId(registry.blocksByName.dirt.defaultState))

  // Create a new database and store this chunk in there
  const db = new LevelDB('./__sample', { createIfMissing: true }) // Create a DB class
  await db.open() // Open the database
  const world = new WorldProvider(db, { dimension: 0 })
  world.save(cc) // Store this chunk in world
  await db.close() // Close it
  // Done! 😃
}
```

See tests/ for more usage examples.

## API

### WorldProvider

#### constructor(db: LevelDB, options?: { dimension: number; version: string; });

The exported `WorldProvider` class allows you to load a save file from a LevelDB database. The
first parameter is the db ([leveldb-zlib](http://npmjs.com/package/leveldb-zlib) instance), and the
second is an options object. The options argument takes a dimension ID (overworld or nether or end are 1, 2 and 3).

The options argument also takes a version, which if not specified will default to the latest version. When you
access APIs like getBlock or setBlock, this is the version which will be assumed.

#### load(x: number, z: number, full: boolean): Promise<ChunkColumn>

This returns a ChunkColumn at the specified `x` and `z` coordinates. `full` if we should load biomes,
entities, tiles, and other related data ontop of chunks.

#### save(x: number, z: number, column: ChunkColumn): Promise<void>

Saves a ChunkColumn into the database.
