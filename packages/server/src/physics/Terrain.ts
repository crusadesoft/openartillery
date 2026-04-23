import { BIOMES, BiomeId, TerrainState, WORLD } from "@artillery/shared";

/**
 * Deterministic Mulberry32 PRNG — keeps terrain generation reproducible
 * from a room seed so clients could replay if we ever want that.
 */
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a heightmap using layered sine waves plus low-frequency noise.
 * Biome influences baseline height and amplitude so different maps feel
 * distinct even with identical seeds.
 */
export function generateHeights(
  width: number,
  seed: number,
  biome: BiomeId = "grasslands",
): number[] {
  const palette = BIOMES[biome];
  const rng = mulberry32(seed);
  const baseline = WORLD.HEIGHT * palette.baseline;
  const amp = WORLD.HEIGHT * palette.amplitude;
  const layers = [
    { freq: 2 + rng() * 2, phase: rng() * Math.PI * 2, amp: amp * 0.55 },
    { freq: 5 + rng() * 3, phase: rng() * Math.PI * 2, amp: amp * 0.3 },
    { freq: 11 + rng() * 5, phase: rng() * Math.PI * 2, amp: amp * 0.15 },
  ];
  const out = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    const t = x / width;
    let h = baseline;
    for (const l of layers) {
      h -= Math.sin(t * l.freq * Math.PI * 2 + l.phase) * l.amp;
    }
    h += (rng() - 0.5) * 6;
    out[x] = Math.max(60, Math.min(WORLD.HEIGHT - 20, h));
  }
  return out;
}

export class Terrain {
  readonly width: number;
  readonly heights: number[];

  constructor(
    public state: TerrainState,
    seed: number,
    biome: BiomeId = "grasslands",
  ) {
    this.width = WORLD.WIDTH;
    this.heights = generateHeights(this.width, seed, biome);
    state.width = this.width;
    state.seed = seed;
    state.heights.length = 0;
    for (const h of this.heights) state.heights.push(h);
  }

  heightAt(x: number): number {
    const col = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.heights[col]!;
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width) return false;
    if (y < 0) return false;
    if (y >= WORLD.HEIGHT) return true;
    return y >= this.heightAt(x);
  }

  explode(ex: number, ey: number, radius: number): void {
    const r2 = radius * radius;
    const xStart = Math.max(0, Math.floor(ex - radius));
    const xEnd = Math.min(this.width - 1, Math.ceil(ex + radius));
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x - ex;
      const dy = Math.sqrt(Math.max(0, r2 - dx * dx));
      const top = ey - dy;
      const bot = ey + dy;
      const h = this.heights[x]!;
      if (top <= h && bot > h) {
        const nh = Math.min(WORLD.HEIGHT - 1, bot);
        if (nh !== h) this.setHeight(x, nh);
      }
    }
  }

  mound(ex: number, ey: number, radius: number): void {
    const r2 = radius * radius;
    const xStart = Math.max(0, Math.floor(ex - radius));
    const xEnd = Math.min(this.width - 1, Math.ceil(ex + radius));
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x - ex;
      const dy = Math.sqrt(Math.max(0, r2 - dx * dx));
      const top = ey - dy;
      const h = this.heights[x]!;
      if (top < h) this.setHeight(x, Math.max(40, top));
    }
  }

  private setHeight(x: number, y: number): void {
    this.heights[x] = y;
    this.state.heights[x] = y;
  }
}
