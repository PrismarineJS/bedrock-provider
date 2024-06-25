## 3.1.0
* [Create commands.yml workflow](https://github.com/PrismarineJS/bedrock-provider/commit/697c6fd799e2cdaf5ad4e5dd32ab1793fdfe7b59) (thanks @extremeheat)
* [Support 1.18.10, 1.18.30 and 1.19.1 (#22)](https://github.com/PrismarineJS/bedrock-provider/commit/f4cab76906216dae1caf1a765d7e882874114aa9) (thanks @extremeheat)

## 3.0.0
* Remove old chunk implementation (#18) @extremeheat
  * Use prismarine-chunk chunk implementation
* Fix nether chunk keys (#19) @extremeheat

## 2.2.0
* Implement prismarine chunk

## 2.1.0
* Add bedrock 1.17.30 and 1.18 level support

## 2.0
* (Breaking) New API, see README.md

## 1.0.1

* Add 1.16.220 data
* ChunkColumn: New .getBlockRuntimeID and .setBlockRuntimeID methods for network block updates

## 1.0.0

* (Breaking) ChunkColumn : `.setBlock, .getBlock, .getBiome, .setBiome, .getBlockEntity, .setBlockEntity` position paramaters are now a Vector3 { x, y, z } object
* Version handling refactor
* ChunkColumn: New .serialize, .deserialize methods for making copies. Adds toJson() and fromJson() as aliases, use toJson(true) to force JSON serialization

## 0.1.2

Fix world loading bugs

## 0.1.1

multi version support

## 0.1.0

it works
