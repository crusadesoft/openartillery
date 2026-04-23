import { describe, it, expect } from "vitest";
import { TerrainState, WORLD } from "@artillery/shared";
import { Terrain, generateHeights } from "./Terrain.js";

function newTerrain(seed = 42): Terrain {
  return new Terrain(new TerrainState(), seed);
}

describe("generateHeights", () => {
  it("is deterministic for a given seed", () => {
    const a = generateHeights(1000, 123);
    const b = generateHeights(1000, 123);
    expect(a).toEqual(b);
  });

  it("stays within world bounds", () => {
    const h = generateHeights(WORLD.WIDTH, 7);
    for (const y of h) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(WORLD.HEIGHT);
    }
  });
});

describe("Terrain.explode", () => {
  it("lowers the surface when the blast overlaps ground", () => {
    const t = newTerrain();
    const col = 200;
    const before = t.heightAt(col);
    t.explode(col, before - 10, 40);
    const after = t.heightAt(col);
    expect(after).toBeGreaterThan(before);
  });

  it("is a no-op if explosion is entirely above ground", () => {
    const t = newTerrain();
    const col = 300;
    const before = t.heightAt(col);
    t.explode(col, before - 200, 10);
    const after = t.heightAt(col);
    expect(after).toBe(before);
  });

  it("mound raises terrain", () => {
    const t = newTerrain();
    const col = 400;
    const before = t.heightAt(col);
    t.mound(col, before - 20, 40);
    const after = t.heightAt(col);
    expect(after).toBeLessThan(before);
  });
});

describe("Terrain.isSolid", () => {
  it("below surface is solid, above is not", () => {
    const t = newTerrain();
    const col = 100;
    const y = t.heightAt(col);
    expect(t.isSolid(col, y + 10)).toBe(true);
    expect(t.isSolid(col, y - 10)).toBe(false);
  });
});
