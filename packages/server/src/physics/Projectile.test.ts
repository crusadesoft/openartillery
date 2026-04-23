import { describe, it, expect } from "vitest";
import { TerrainState } from "@artillery/shared";
import { Terrain } from "./Terrain.js";
import { createProjectile, stepProjectiles } from "./Projectile.js";

describe("stepProjectiles", () => {
  it("applies gravity over time (y grows positive)", () => {
    const terrain = new Terrain(new TerrainState(), 1);
    const body = createProjectile("p1", "o1", "shell", 300, 100, 0, 0);
    const y0 = body.state.y;
    for (let i = 0; i < 10; i++) {
      stepProjectiles([body], terrain, 0, 1 / 30);
    }
    expect(body.state.y).toBeGreaterThan(y0);
  });

  it("detonates when hitting ground", () => {
    const terrain = new Terrain(new TerrainState(), 2);
    const col = 500;
    const surface = terrain.heightAt(col);
    const body = createProjectile("p2", "o1", "shell", col, surface - 5, 0, 200);
    const impacts: { x: number }[] = [];
    let ticks = 0;
    while (ticks++ < 60) {
      const r = stepProjectiles([body], terrain, 0, 1 / 30);
      if (r.impacts.length > 0) {
        impacts.push(...r.impacts);
        break;
      }
    }
    expect(impacts.length).toBe(1);
  });

  it("bouncing weapon reflects at least once", () => {
    const terrain = new Terrain(new TerrainState(), 3);
    const col = 600;
    const surface = terrain.heightAt(col);
    const body = createProjectile("p3", "o1", "skipper", col, surface - 20, 150, 400);
    let bounces = 3;
    let ticks = 0;
    while (ticks++ < 100 && bounces > 0) {
      const r = stepProjectiles([body], terrain, 0, 1 / 30);
      if (r.impacts.length > 0) break;
      bounces = body.bouncesLeft;
    }
    expect(body.bouncesLeft).toBeLessThan(2); // started with 2
  });
});
