export type BiomeId = "grasslands" | "desert" | "arctic" | "lava" | "dusk";

export interface BiomePalette {
  id: BiomeId;
  label: string;
  /** topline grass / ground-top color */
  grass: number;
  /** topsoil fill just below surface */
  topsoil: number;
  /** deep ground fill */
  dirt: number;
  /** bedrock fill — exposed only when craters cut deep */
  bedrock: number;
  /** ambient sky tones, linearly sampled top → bottom */
  skyTop: number;
  skyBottom: number;
  /** near/far mountain silhouettes for parallax */
  mountainFar: number;
  mountainNear: number;
  /** flavor for UI */
  blurb: string;
  /** terrain noise characteristics */
  amplitude: number;
  /** baseline fraction of world height (0-1) */
  baseline: number;
}

export const BIOMES: Record<BiomeId, BiomePalette> = {
  grasslands: {
    id: "grasslands",
    label: "Grasslands",
    grass: 0x8ae66e,
    topsoil: 0x6b4a2a,
    dirt: 0x3a2a1e,
    bedrock: 0x14100c,
    skyTop: 0x1d2a55,
    skyBottom: 0x05070f,
    mountainFar: 0x1a2547,
    mountainNear: 0x0d1430,
    blurb: "Rolling hills under a starry sky.",
    amplitude: 0.22,
    baseline: 0.65,
  },
  desert: {
    id: "desert",
    label: "Desert",
    grass: 0xffb347,
    topsoil: 0xc47a27,
    dirt: 0x5a3b16,
    bedrock: 0x2a1606,
    skyTop: 0x3a2a55,
    skyBottom: 0xff7b38,
    mountainFar: 0x47325a,
    mountainNear: 0x2d1d3a,
    blurb: "Dust storms and heat-shimmered dunes.",
    amplitude: 0.16,
    baseline: 0.68,
  },
  arctic: {
    id: "arctic",
    label: "Arctic",
    grass: 0xecf5ff,
    topsoil: 0xa3c6e5,
    dirt: 0x4a6a8a,
    bedrock: 0x1e2c40,
    skyTop: 0x0a1f3e,
    skyBottom: 0x2a4a7a,
    mountainFar: 0x2a3a6a,
    mountainNear: 0x12213f,
    blurb: "Frozen wastes. Aim for the ice cracks.",
    amplitude: 0.19,
    baseline: 0.66,
  },
  lava: {
    id: "lava",
    label: "Ashen Crater",
    grass: 0xff4a2e,
    topsoil: 0x8a2a1a,
    dirt: 0x2a0a0a,
    bedrock: 0x0a0202,
    skyTop: 0x2a0a1a,
    skyBottom: 0x1a0505,
    mountainFar: 0x1a0a1a,
    mountainNear: 0x0a0404,
    blurb: "Pools of magma glow between the rocks.",
    amplitude: 0.25,
    baseline: 0.62,
  },
  dusk: {
    id: "dusk",
    label: "Dusk Hills",
    grass: 0xffc56e,
    topsoil: 0x8a4a3a,
    dirt: 0x3a1a2a,
    bedrock: 0x180810,
    skyTop: 0x2b1760,
    skyBottom: 0xff6b8a,
    mountainFar: 0x3a205a,
    mountainNear: 0x1a0c2a,
    blurb: "A long purple sunset over a tired war.",
    amplitude: 0.2,
    baseline: 0.65,
  },
};

export const ALL_BIOMES: BiomeId[] = [
  "grasslands",
  "desert",
  "arctic",
  "lava",
  "dusk",
];

export function randomBiome(): BiomeId {
  return ALL_BIOMES[Math.floor(Math.random() * ALL_BIOMES.length)]!;
}
