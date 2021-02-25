# bedrock-provider
<!--[![NPM version](https://img.shields.io/npm/v/bedrock-provider.svg)](http://npmjs.com/package/bedrock-provider)-->
[![Build Status](https://github.com/extremeheat/bedrock-provider/workflows/CI/badge.svg)](https://github.com/extremeheat/bedrock-provider/actions?query=workflow%3A%22CI%22)
[![Discord](https://img.shields.io/badge/chat-on%20discord-brightgreen.svg)](https://discord.gg/GsEFRM8)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-brightgreen.svg)](https://gitter.im/PrismarineJS/general)
[![Irc](https://img.shields.io/badge/chat-on%20irc-brightgreen.svg)](https://irc.gitter.im/)
[![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/prismarine-template)

Minecraft Bedrock level provider for saves and network serialization

## Install

```js
npm i extremeheat/bedrock-provider
```

## Usage

Writing example:

```js
const fs = require('fs')
const { LevelDB } = require('leveldb-zlib')
const { ChunkColumn, Version, WorldProvider } = require('bedrock-provider')
const Block = require('prismarine-block')('1.16')

async function main() {
  // Create a new ChunkColumn at (0,0)
  let cc = new ChunkColumn(Version.v1_4_0, 0, 0)

  for (var x = 0; x < 4; x++) {
    for (var y = 0; y < 4; y++) {
      for (var z = 0; z < 4; z++) {
        // Set some random block IDs
        const id = Math.floor(Math.random() * 1000)
        let block = Block.fromStateId(id)
        cc.setBlock(x, y, z, block)
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

#### constructor(db: LevelDB, options?: { dimension: number; });
#### load(x: number, z: number, full: boolean): Promise<ChunkColumn>;
#### save(column: ChunkColumn): Promise<void>;


### ChunkColumn

```js
    constructor(version: Version, x: any, z: any);
    getBlock(sx: int, sy: int, sz: int): Block;
    setBlock(sx: int, sy: int, sz: int, block: Block): void;
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
