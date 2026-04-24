import { type BattleState, TANK, WEAPONS, WORLD, type WeaponId } from "@artillery/shared";
import type { ProjectileBody } from "./Projectile.js";
import type { DamageRecord, StepTelemetry } from "./World.js";

/** Applies blast damage from an explosion at (x, y) to every live tank
 *  within the effective radius. Mutates player state (hp, dead, kills,
 *  deaths, damageDealt) and appends `damages` + `deaths` entries to
 *  `out`. Pure with respect to terrain — callers handle crater/mound
 *  deformation separately. */
export function applyBlastDamage(
  state: BattleState,
  body: ProjectileBody,
  x: number,
  y: number,
  radius: number,
  baseDmg: number,
  out: StepTelemetry,
): void {
  const owner = state.players.get(body.state.ownerId);
  state.players.forEach((p) => {
    if (p.dead) return;
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = Math.hypot(dx, dy);
    const effective = radius + TANK.WIDTH / 2;
    if (dist >= effective) return;
    const falloff = Math.max(0, 1 - dist / effective);
    const dmg = Math.round(baseDmg * falloff);
    if (dmg <= 0) return;
    const applied = Math.min(p.hp, dmg);
    p.hp = Math.max(0, p.hp - dmg);
    if (owner && owner.id !== p.id) owner.damageDealt += applied;
    const knock = falloff * 14;
    p.x = Math.max(
      10,
      Math.min(WORLD.WIDTH - 10, p.x + Math.sign(dx || 1) * knock),
    );
    const killed = p.hp <= 0;
    if (killed) {
      p.dead = true;
      p.deaths += 1;
      out.deaths.push(p.id);
      if (owner && owner.id !== p.id) owner.kills += 1;
    }
    out.damages.push({
      tankId: p.id,
      ownerId: body.state.ownerId,
      weapon: body.weapon,
      amount: applied,
      x: p.x,
      y: p.y - TANK.HEIGHT / 2,
      killed,
    });
  });
}

/** Napalm DoT: each fire tile applies damage-per-second to any tank
 *  whose AABB overlaps it. Fire tiles track terrain height changes so
 *  they hug the deformed surface. */
export function tickFires(
  state: BattleState,
  heightAt: (x: number) => number,
  dt: number,
  damages: DamageRecord[],
  deaths: string[],
): void {
  state.fires.forEach((tile) => {
    tile.y = heightAt(tile.x) - 10;
    state.players.forEach((p) => {
      if (p.dead) return;
      const dx = p.x - tile.x;
      const dy = p.y - tile.y;
      if (Math.hypot(dx, dy) >= tile.radius + TANK.WIDTH / 2) return;
      const def = WEAPONS.napalm;
      const dps = def.napalm?.damagePerSec ?? 10;
      const dmg = Math.max(1, Math.round(dps * dt));
      const applied = Math.min(p.hp, dmg);
      p.hp = Math.max(0, p.hp - dmg);
      const owner = state.players.get(tile.ownerId);
      if (owner && owner.id !== p.id) owner.damageDealt += applied;
      const killed = p.hp <= 0;
      if (killed) {
        p.dead = true;
        p.deaths += 1;
        deaths.push(p.id);
        if (owner && owner.id !== p.id) owner.kills += 1;
      }
      damages.push({
        tankId: p.id,
        ownerId: tile.ownerId,
        weapon: "napalm" as WeaponId,
        amount: applied,
        x: p.x,
        y: p.y - TANK.HEIGHT / 2,
        killed,
      });
    });
  });
}

export function pruneFires(state: BattleState, now: number): void {
  const expired: string[] = [];
  state.fires.forEach((f, key) => {
    if (f.expiresAt <= now) expired.push(key);
  });
  for (const k of expired) state.fires.delete(k);
}
