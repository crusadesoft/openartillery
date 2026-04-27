import { BIOMES, BiomeId, TerrainState, WORLD } from "@artillery/shared";
import type { RapierIntegrator } from "./rapierWorld.js";

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
  /** Optional Rapier integrator. When set, every height mutation rebuilds
   *  the polyline collider so projectiles see the new surface. Tests that
   *  exercise terrain math in isolation can leave it unset. */
  private integrator: RapierIntegrator | null = null;

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

  attachIntegrator(integrator: RapierIntegrator): void {
    this.integrator = integrator;
    integrator.rebuildTerrain(this.heights);
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
    // Carve a smooth parabolic bowl instead of subtracting a raw sphere
    // — the raw-sphere approach left vertical ledges where the crater
    // boundary met the unaffected terrain. With a bowl, adjacent
    // columns change in gradually-decreasing amounts toward the rim.
    const xStart = Math.max(0, Math.floor(ex - radius - 2));
    const xEnd = Math.min(this.width - 1, Math.ceil(ex + radius + 2));
    let touched = false;
    for (let x = xStart; x <= xEnd; x++) {
      const dx = (x - ex) / radius;
      if (dx * dx >= 1) continue;
      // Smooth parabolic bowl: depth = radius at centre, 0 at rim.
      const depth = radius * (1 - dx * dx);
      const craterSurfaceY = ey + depth;
      const h = this.heights[x]!;
      if (craterSurfaceY > h) {
        this.setHeight(x, Math.min(WORLD.HEIGHT - 1, craterSurfaceY));
        touched = true;
      }
    }
    // Skip the slump pass entirely if no column was carved — otherwise a
    // completely-above-ground explosion still drifts heights via the
    // binomial blur, which broke idempotency for airbursts.
    if (!touched) return;
    // Slump pass — two iterations of a light binomial blur over the
    // crater neighbourhood (plus a short spillover). Smooths the rim
    // cliff without erasing the crater's concavity.
    smoothBand(
      this.heights,
      this.state.heights,
      Math.max(1, Math.floor(ex - radius - 6)),
      Math.min(this.width - 2, Math.ceil(ex + radius + 6)),
      2,
    );
    this.integrator?.rebuildTerrain(this.heights);
  }

  mound(ex: number, ey: number, radius: number): void {
    // Dome-shaped addition using the same parabolic profile — builds
    // terrain instead of removing it, with soft shoulders rather than
    // a clipped sphere top.
    const xStart = Math.max(0, Math.floor(ex - radius - 2));
    const xEnd = Math.min(this.width - 1, Math.ceil(ex + radius + 2));
    let touched = false;
    for (let x = xStart; x <= xEnd; x++) {
      const dx = (x - ex) / radius;
      if (dx * dx >= 1) continue;
      const lift = radius * (1 - dx * dx);
      const domeTop = ey - lift;
      const h = this.heights[x]!;
      if (domeTop < h) {
        this.setHeight(x, Math.max(40, domeTop));
        touched = true;
      }
    }
    if (!touched) return;
    smoothBand(
      this.heights,
      this.state.heights,
      Math.max(1, Math.floor(ex - radius - 6)),
      Math.min(this.width - 2, Math.ceil(ex + radius + 6)),
      2,
    );
    this.integrator?.rebuildTerrain(this.heights);
  }

  private setHeight(x: number, y: number): void {
    this.heights[x] = y;
    this.state.heights[x] = y;
  }
}

/** Binomial-weighted [1, 2, 1] / 4 low-pass filter applied to a band of
 *  columns. Run for `passes` iterations. Mutates both the local heights
 *  array and the synced state array so the client sees the smoothed
 *  result immediately. Preserves wide features (craters, hills) while
 *  melting sharp rim cliffs between adjacent columns. */
function smoothBand(
  heights: number[],
  state: { [i: number]: number },
  lo: number,
  hi: number,
  passes: number,
): void {
  const n = heights.length;
  for (let p = 0; p < passes; p++) {
    const buf = heights.slice(Math.max(0, lo - 1), Math.min(n, hi + 2));
    const bufOff = Math.max(0, lo - 1);
    for (let x = lo; x <= hi; x++) {
      const l = buf[x - 1 - bufOff] ?? heights[x - 1]!;
      const m = buf[x - bufOff]     ?? heights[x]!;
      const r = buf[x + 1 - bufOff] ?? heights[x + 1]!;
      const avg = (l + m * 2 + r) * 0.25;
      heights[x] = avg;
      state[x] = avg;
    }
  }
}
