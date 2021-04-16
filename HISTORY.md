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