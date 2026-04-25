import { describe, it, expect } from "vitest";
import { BattleState, Player, WORLD } from "@artillery/shared";
import { World } from "./World.js";

describe("airstrike sub-munitions", () => {
  it("spawns 4 child shells when the parent detonates", () => {
    const state = new BattleState();
    state.terrain.width = WORLD.WIDTH;
    const world = new World(state, 1, "grasslands");
    const owner = new Player();
    owner.id = "p1";
    owner.x = 600;
    owner.y = world.terrain.heightAt(600) - 10;
    owner.angle = 45;
    owner.power = 800;
    owner.facing = 1;
    owner.weapon = "airstrike";
    state.players.set(owner.id, owner);

    world.fire(owner);
    expect(world.projectiles.size).toBe(1);

    // Step forward up to 4s. Once the parent impacts, the children
    // should appear in the same tick, replacing the parent in the map.
    let detonated = false;
    for (let i = 0; i < 240 && !detonated; i++) {
      world.step(1 / 60);
      if (world.projectiles.size > 1) detonated = true;
    }

    expect(detonated).toBe(true);
    expect(world.projectiles.size).toBe(4);

    // All four should have unique IDs and live in the schema.
    const ids = new Set<string>();
    world.projectiles.forEach((b) => ids.add(b.state.id));
    expect(ids.size).toBe(4);
    expect(state.projectiles.size).toBe(4);

    // Step them down a bit and check they're spread apart enough that
    // they wouldn't render as a single overlapping sprite.
    for (let i = 0; i < 6; i++) world.step(1 / 60);
    const xs: number[] = [];
    world.projectiles.forEach((b) => xs.push(b.state.x));
    xs.sort((a, b) => a - b);
    expect(xs[3]! - xs[0]!).toBeGreaterThan(120);
  });
});
