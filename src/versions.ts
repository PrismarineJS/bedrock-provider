// Chunk version
export enum Version {
  v0_9_00 = 0,
  v0_9_02 = 1, // added to fix the grass color being corrupted
  v0_9_05 = 2, // make sure that biomes are not corrupted
  v0_17_0 = 3, // switch to a key per subchunk + 2D data
  v0_18_0 = 4, // made beds be block entities
  vConsole1_to_v0_18_0 = 5, // converted from another version of the game
  v1_2_0 = 6, // Format added in MC1.2 - for upgrading structure spawners
  v1_2_0_bis = 7, // second format added in MC1.2 - to remove dynamic water in oceans
  v1_4_0 = 8,
  v1_8_0 = 9,
  v1_9_0 = 10,
  v1_10_0 = 11,
  v1_11_0 = 12,
  v1_11_1 = 13,
  v1_11_2 = 14,
  v1_12_0 = 15,
  v1_15_0 = 16,
  v1_15_1 = 17,
  v1_16_0 = 18,
  v1_16_1 = 19,
  v1_16_100 = 20,
  v1_16_200 = 21,
  v1_16_210 = 22, // caves and cliffs disabled

  v1_17_0 = 25, // 1.17.0-20 caves and cliffs enabled

  v1_17_30 = 29, // 1.17.30 caves and cliffs enabled

  v1_17_40 = 31,

  v1_18_0 = 39,
  v1_18_30 = 40
}

// TODO: move to mcdata
export function minecraftVersionToChunkVersion (version: string): number {
  return {
    '1.16.201': Version.v1_16_200,
    '1.16.210': Version.v1_16_210,
    '1.16.220': Version.v1_16_210,
    '1.17.0': Version.v1_17_0,
    '1.17.10': Version.v1_17_0,
    '1.17.30': Version.v1_17_30,
    '1.17.40': Version.v1_17_40,
    '1.18.0': Version.v1_18_0
  }[version.replace('bedrock_', '')]
}

export function chunkVersionToMinecraftVersion (version: number): string {
  if (version >= Version.v1_18_0) return '1.18.0'
  if (version >= Version.v1_17_40) return '1.17.40'
  if (version >= Version.v1_17_30) return '1.17.30'
  if (version >= Version.v1_17_0) return '1.17.0'
  // if (version >= Version.v1_16_210) return '1.16.201'
  if (version >= Version.v1_16_210) return '1.17.0' // '1.16.220'
  if (version >= Version.v1_16_200) return '1.16.201'
  if (version >= Version.v1_16_1) return '1.16.1'
  if (version >= Version.v1_16_0) return '1.16.0'
  if (version >= Version.v1_15_1) return '1.15.1'
  if (version >= Version.v1_15_0) return '1.15.0'
  if (version >= Version.v1_12_0) return '1.12.0'
  if (version >= Version.v1_11_2) return '1.11.2'
  if (version >= Version.v1_11_1) return '1.11.1'
  if (version >= Version.v1_11_0) return '1.11.0'
  throw new Error(`Unknown chunk version ${version}`)
}

export function getHandlingForChunkVersion (version: number) {
  if (version >= Version.v1_18_0) return '1.18'
  if (version >= Version.v1_17_0) return '1.19'
  return '1.17'
}
