import { Projectile, WEAPONS, WORLD, WeaponId } from "@artillery/shared";
import { Terrain } from "./Terrain.js";
import type { ProjectileHandle, RapierIntegrator } from "./rapierWorld.js";

export interface ProjectileBody {
  state: Projectile;
  weapon: WeaponId;
  bouncesLeft: number;
  ttl: number;
  /** seconds of flight so far (used by MIRV split timer) */
  age: number;
  /** true = already split; do not split again */
  split: boolean;
  /** seconds spent below restDetonate.speedThreshold (grenade fuse) */
  restTime: number;
  /** Rapier handles — owned by the integrator, freed on remove. */
  handle: ProjectileHandle;
}

export function createProjectile(
  integrator: RapierIntegrator,
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
  const handle = integrator.createProjectile(weapon, x, y, vx, vy, def.projectileRadius);
  return {
    state,
    weapon,
    bouncesLeft: def.bounces ?? 0,
    ttl: 14,
    age: 0,
    split: false,
    restTime: 0,
    handle,
  };
}

export interface StepResult {
  impacts: { body: ProjectileBody; x: number; y: number }[];
  offscreen: ProjectileBody[];
  /** bodies that reached their mid-flight split condition */
  splits: ProjectileBody[];
}

/** One physics tick. The Rapier world handles integration, contacts,
 *  and bouncing; this function stitches the higher-level rules around
 *  it: TTL, MIRV split, bounce counting, grenade rest-fuse, offscreen,
 *  and reading positions back into our schema state. */
export function stepProjectiles(
  bodies: Iterable<ProjectileBody>,
  terrain: Terrain,
  integrator: RapierIntegrator,
  wind: number,
  dt: number,
): StepResult {
  const impacts: StepResult["impacts"] = [];
  const offscreen: ProjectileBody[] = [];
  const splits: ProjectileBody[] = [];

  // Pre-step: apply wind, advance age/ttl, handle MIRV split. Bodies
  // marked for split/ttl-impact are not stepped this frame.
  const live: ProjectileBody[] = [];
  const handleToBody = new Map<number, ProjectileBody>();
  for (const b of bodies) {
    b.ttl -= dt;
    b.age += dt;
    if (b.ttl <= 0) {
      impacts.push({ body: b, x: b.state.x, y: b.state.y });
      continue;
    }
    const def = WEAPONS[b.weapon];
    if (def.mirv && !b.split && b.age >= def.mirv.splitAfterSec) {
      b.split = true;
      splits.push(b);
      continue;
    }
    integrator.applyWind(b.handle, wind, dt);
    live.push(b);
    handleToBody.set(b.handle.bodyHandle, b);
  }

  const { contacts } = integrator.step(dt);

  for (const b of live) {
    const def = WEAPONS[b.weapon];
    const k = integrator.readState(b.handle);
    if (!k) continue;
    b.state.x = k.x;
    b.state.y = k.y;
    b.state.vx = k.vx;
    b.state.vy = k.vy;

    if (k.x < -200 || k.x > WORLD.WIDTH + 200 || k.y > WORLD.HEIGHT + 400) {
      offscreen.push(b);
      continue;
    }

    const hit = contacts.has(b.handle.bodyHandle);
    if (hit) {
      if (b.bouncesLeft > 0) {
        b.bouncesLeft--;
        // Rapier's restitution already produced the bounce; nothing else
        // to do until the next contact.
      } else if (!def.restDetonate) {
        impacts.push({ body: b, x: k.x, y: k.y });
        continue;
      }
      // restDetonate weapons (grenade) keep rolling until the rest-fuse
      // below decides they're settled.
    }

    if (def.restDetonate && b.bouncesLeft <= 0) {
      const threshold = def.restDetonate.speedThreshold ?? 40;
      const surface = terrain.heightAt(k.x);
      const onGround = k.y >= surface - 8;
      if (k.speed < threshold && onGround) {
        b.restTime += dt;
        if (b.restTime >= def.restDetonate.afterSec) {
          impacts.push({ body: b, x: k.x, y: k.y });
          continue;
        }
      } else {
        b.restTime = 0;
      }
    }
  }

  return { impacts, offscreen, splits };
}
