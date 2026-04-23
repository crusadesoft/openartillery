import { Projectile, WEAPONS, WORLD, WeaponId } from "@artillery/shared";
import { Terrain } from "./Terrain.js";

export interface ProjectileBody {
  state: Projectile;
  weapon: WeaponId;
  bouncesLeft: number;
  ttl: number;
  /** seconds of flight so far (used by MIRV split timer) */
  age: number;
  /** true = already split; do not split again */
  split: boolean;
}

export function createProjectile(
  id: string,
  ownerId: string,
  weapon: WeaponId,
  x: number,
  y: number,
  vx: number,
  vy: number,
): ProjectileBody {
  const def = WEAPONS[weapon];
  const state = new Projectile();
  state.id = id;
  state.ownerId = ownerId;
  state.weapon = weapon;
  state.x = x;
  state.y = y;
  state.vx = vx;
  state.vy = vy;
  state.tint = def.tint;
  state.radius = def.projectileRadius;
  return {
    state,
    weapon,
    bouncesLeft: def.bounces ?? 0,
    ttl: 14,
    age: 0,
    split: false,
  };
}

export interface StepResult {
  impacts: { body: ProjectileBody; x: number; y: number }[];
  offscreen: ProjectileBody[];
  /** bodies that reached their mid-flight split condition */
  splits: ProjectileBody[];
}

export function stepProjectiles(
  bodies: Iterable<ProjectileBody>,
  terrain: Terrain,
  wind: number,
  dt: number,
): StepResult {
  const impacts: StepResult["impacts"] = [];
  const offscreen: ProjectileBody[] = [];
  const splits: ProjectileBody[] = [];

  for (const b of bodies) {
    b.ttl -= dt;
    b.age += dt;
    if (b.ttl <= 0) {
      impacts.push({ body: b, x: b.state.x, y: b.state.y });
      continue;
    }

    // MIRV: signal split, let the world spawn the children; skip stepping.
    const def = WEAPONS[b.weapon];
    if (def.mirv && !b.split && b.age >= def.mirv.splitAfterSec) {
      b.split = true;
      splits.push(b);
      continue;
    }

    const speed = Math.hypot(b.state.vx, b.state.vy);
    const substeps = Math.max(1, Math.ceil((speed * dt) / 8));
    const sdt = dt / substeps;

    let exploded = false;
    for (let i = 0; i < substeps && !exploded; i++) {
      b.state.vx += wind * sdt;
      b.state.vy += WORLD.GRAVITY * sdt;
      b.state.vx -= b.state.vx * WORLD.AIR_DRAG * speed * sdt;

      const nx = b.state.x + b.state.vx * sdt;
      const ny = b.state.y + b.state.vy * sdt;

      if (nx < -200 || nx > WORLD.WIDTH + 200 || ny > WORLD.HEIGHT + 400) {
        offscreen.push(b);
        exploded = true;
        break;
      }

      if (terrain.isSolid(nx, ny)) {
        if (b.bouncesLeft > 0) {
          b.bouncesLeft--;
          const slope = terrain.heightAt(nx + 4) - terrain.heightAt(nx - 4);
          const nlen = Math.hypot(slope, 8);
          const nxn = -slope / nlen;
          const nyn = -8 / nlen;
          const dot = b.state.vx * nxn + b.state.vy * nyn;
          b.state.vx = (b.state.vx - 2 * dot * nxn) * 0.55;
          b.state.vy = (b.state.vy - 2 * dot * nyn) * 0.55;
          b.state.x = nx + nxn * 3;
          b.state.y = ny + nyn * 3;
        } else {
          impacts.push({ body: b, x: nx, y: ny });
          exploded = true;
        }
      } else {
        b.state.x = nx;
        b.state.y = ny;
      }
    }
  }

  return { impacts, offscreen, splits };
}
