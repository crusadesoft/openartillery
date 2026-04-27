import { describe, it, expect } from "vitest";
import { BattleState, Player, Projectile, type WeaponId } from "@artillery/shared";
import { applyBlastDamage } from "./DamageResolver.js";
import type { ProjectileBody } from "./Projectile.js";
import type { StepTelemetry } from "./World.js";

function makeState(opts: {
  teamMode: boolean;
  friendlyFire: boolean;
  players: Array<{ id: string; team: number; x: number; hp?: number }>;
}): BattleState {
  const state = new BattleState();
  state.teamMode = opts.teamMode;
  state.friendlyFire = opts.friendlyFire;
  for (const p of opts.players) {
    const player = new Player();
    player.id = p.id;
    player.team = p.team;
    player.x = p.x;
    player.y = 100;
    player.hp = p.hp ?? 300;
    state.players.set(p.id, player);
  }
  return state;
}

function makeBody(ownerId: string, weapon: WeaponId = "shell"): ProjectileBody {
  // Damage tests don't exercise physics — fabricate a minimal body so we
  // don't have to spin up a Rapier world per case.
  const state = new Projectile();
  state.id = "proj1";
  state.ownerId = ownerId;
  state.weapon = weapon;
  return {
    state,
    weapon,
    bouncesLeft: 0,
    ttl: 14,
    age: 0,
    split: false,
    restTime: 0,
    handle: { bodyHandle: -1, colliderHandle: -1 },
  };
}

function emptyTelemetry(): StepTelemetry {
  return { explosions: [], damages: [], deaths: [] };
}

describe("applyBlastDamage friendly-fire gate", () => {
  it("with FF off, allies take zero damage and no knockback", () => {
    const state = makeState({
      teamMode: true,
      friendlyFire: false,
      players: [
        // Owner well outside the blast — only the ally sits in it.
        { id: "owner", team: 1, x: 1000 },
        { id: "ally", team: 1, x: 110 },
      ],
    });
    const ally = state.players.get("ally")!;
    const xBefore = ally.x;
    const tele = emptyTelemetry();
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, tele);
    expect(ally.hp).toBe(300);
    expect(ally.x).toBe(xBefore);
    expect(tele.damages).toHaveLength(0);
  });

  it("with FF off, enemies still take full damage", () => {
    const state = makeState({
      teamMode: true,
      friendlyFire: false,
      players: [
        { id: "owner", team: 1, x: 100 },
        { id: "foe", team: 2, x: 110 },
      ],
    });
    const foe = state.players.get("foe")!;
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, emptyTelemetry());
    expect(foe.hp).toBeLessThan(300);
  });

  it("with FF on (override), allies take damage", () => {
    const state = makeState({
      teamMode: true,
      friendlyFire: true,
      players: [
        { id: "owner", team: 1, x: 100 },
        { id: "ally", team: 1, x: 110 },
      ],
    });
    const ally = state.players.get("ally")!;
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, emptyTelemetry());
    expect(ally.hp).toBeLessThan(300);
  });

  it("self-damage applies even with FF off", () => {
    const state = makeState({
      teamMode: true,
      friendlyFire: false,
      players: [{ id: "owner", team: 1, x: 100 }],
    });
    const owner = state.players.get("owner")!;
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, emptyTelemetry());
    expect(owner.hp).toBeLessThan(300);
  });

  it("FFA mode (teamMode=false) ignores team field and damages everyone", () => {
    const state = makeState({
      teamMode: false,
      friendlyFire: false,
      players: [
        { id: "owner", team: 1, x: 100 },
        { id: "ally", team: 1, x: 110 },
      ],
    });
    const ally = state.players.get("ally")!;
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, emptyTelemetry());
    expect(ally.hp).toBeLessThan(300);
  });

  it("with FF off across 4-team mode, team 3 splash spares team 3 and hits team 1/2/4", () => {
    const state = makeState({
      teamMode: true,
      friendlyFire: false,
      players: [
        { id: "owner", team: 3, x: 1000 },
        { id: "ally", team: 3, x: 110 },
        { id: "foe1", team: 1, x: 95 },
        { id: "foe2", team: 2, x: 105 },
        { id: "foe4", team: 4, x: 115 },
      ],
    });
    applyBlastDamage(state, makeBody("owner"), 100, 100, 80, 60, emptyTelemetry());
    expect(state.players.get("ally")!.hp).toBe(300);
    expect(state.players.get("foe1")!.hp).toBeLessThan(300);
    expect(state.players.get("foe2")!.hp).toBeLessThan(300);
    expect(state.players.get("foe4")!.hp).toBeLessThan(300);
  });
});
