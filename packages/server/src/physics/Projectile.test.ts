import { describe, it, expect } from "vitest";
import { BattleState, WORLD } from "@artillery/shared";
import { World } from "./World.js";

describe("stepProjectiles", () => {
  it("applies gravity over time (y grows positive)", () => {
    const state = new BattleState();
    state.terrain.width = WORLD.WIDTH;
    const world = new World(state, 1, "grasslands");
    // Spawn a shell well above the terrain so gravity is unambiguous.
    const body = (world as unknown as {
      spawnProjectile: (
        ownerId: string, weapon: string, x: number, y: number, vx: number, vy: number,
      ) => { state: { y: number } };
    }).spawnProjectile("o1", "shell", 300, 50, 0, 0);
    const y0 = body.state.y;
    for (let i = 0; i < 10; i++) world.step(1 / 30);
    expect(body.state.y).toBeGreaterThan(y0);
    world.dispose();
  });

  it("detonates when hitting ground", () => {
    const state = new BattleState();
    state.terrain.width = WORLD.WIDTH;
    const world = new World(state, 2, "grasslands");
    const col = 500;
    const surface = world.terrain.heightAt(col);
    (world as unknown as {
      spawnProjectile: (
        ownerId: string, weapon: string, x: number, y: number, vx: number, vy: number,
      ) => unknown;
    }).spawnProjectile("o1", "shell", col, surface - 30, 0, 200);
    let detonated = false;
    for (let i = 0; i < 90 && !detonated; i++) {
      world.step(1 / 30);
      if (world.projectiles.size === 0) detonated = true;
    }
    expect(detonated).toBe(true);
    world.dispose();
  });

  it("bouncing weapon survives at least one contact before detonating", () => {
    const state = new BattleState();
    state.terrain.width = WORLD.WIDTH;
    const world = new World(state, 3, "grasslands");
    const col = 600;
    const surface = world.terrain.heightAt(col);
    const body = (world as unknown as {
      spawnProjectile: (
        ownerId: string, weapon: string, x: number, y: number, vx: number, vy: number,
      ) => { bouncesLeft: number };
    }).spawnProjectile("o1", "skipper", col, surface - 60, 150, 400);
    let saw = false;
    for (let i = 0; i < 200 && !saw; i++) {
      world.step(1 / 30);
      if (body.bouncesLeft < 2) saw = true;
    }
    expect(saw).toBe(true); // skipper started with 2 bounces
    world.dispose();
  });
});
