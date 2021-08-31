# bedrock-provider
[![NPM version](https://img.shields.io/npm/v/bedrock-provider.svg)](http://npmjs.com/package/bedrock-provider)
[![Build Status](https://github.com/PrismarineJS/bedrock-provider/workflows/CI/badge.svg)](https://github.com/PrismarineJS/bedrock-provider/actions?query=workflow%3A%22CI%22)
[![Discord](https://img.shields.io/badge/chat-on%20discord-brightgreen.svg)](https://discord.gg/GsEFRM8)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-brightgreen.svg)](https://gitter.im/PrismarineJS/general)
[![Irc](https://img.shields.io/badge/chat-on%20irc-brightgreen.svg)](https://irc.gitter.im/)
[![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/bedrock-provider)

Minecraft Bedrock level provider for saves and network serialization

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
const ChunkColumn = = require('bedrock-provider').chunk('bedrock_1.17.10')
const Block = require('prismarine-block')('bedrock_1.17.10')

async function main() {
  // Create a new ChunkColumn at (0,0)
  let cc = new ChunkColumn(0, 0)

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        // Set some random block IDs
        const id = Math.floor(Math.random() * 1000)
        let block = Block.fromStateId(id)
        cc.setBlock({ x, y, z }, block)
      }
    }
  }

  // Now let's create a new database and store this chunk in there
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

#### load(x: number, z: number, full: boolean): Promise<ChunkColumn>;

This returns a ChunkColumn at the specified `x` and `z` coordinates. `full` if we should load biomes,
entities, tiles, and other related data ontop of chunks.

#### save(column: ChunkColumn): Promise<void>;

Saves a ChunkColumn into the database.

### ChunkColumn

```js
    constructor(version: Version, x: any, z: any);
    getBlock(vec4: { l, x, y, z }): Block;
    setBlock(vec4: { l, x, y, z }, block: Block): void;
    addSection(section: SubChunk): void;

    /**
     * Encodes this chunk column for the network with no caching
     * @param buffer Full chunk buffer
     */
    networkEncodeNoCache(): Promise<Buffer>;
    /**
     * Encodes this chunk column for use over network with caching enabled
     *
     * @param blobStore The blob store to write chunks in this section to
     * @returns {Promise<Buffer[]>} The blob hashes for this chunk, the last one is biomes, rest are sections
     */
    networkEncodeBlobs(blobStore: BlobStore): Promise<CCHash[]>;
    networkEncode(blobStore: BlobStore): Promise<{
        blobs: CCHash[];
        payload: Buffer;
    }>;
    networkDecodeNoCache(buffer: Buffer, sectionCount: number): Promise<void>;
    /**
     * Decodes cached chunks sent over the network
     * @param blobs The blob hashes sent in the Chunk packe
     * @param blobStore Our blob store for cached data
     * @param {Buffer} payload The rest of the non-cached data
     * @returns {CCHash[]} A list of hashes we don't have and need. If len > 0, decode failed.
     */
    networkDecode(blobs: CCHash[], blobStore: BlobStore, payload: any): Promise<CCHash[]>;
```
