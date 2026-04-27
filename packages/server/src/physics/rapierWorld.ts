import RAPIER from "@dimforge/rapier2d-compat";
import { WORLD, WEAPONS, type WeaponId } from "@artillery/shared";

let initPromise: Promise<void> | undefined;

/** Boot the Rapier WASM module. Idempotent — call this once during
 *  server bootstrap before any rooms are constructed. */
export async function initRapier(): Promise<void> {
  if (!initPromise) {
    // Silence the wasm-bindgen "using deprecated parameters for the
    // initialization function" warning — it fires from inside the
    // generated module and isn't actionable on our side.
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("deprecated parameters for the initialization function")) return;
      origWarn(...args);
    };
    initPromise = RAPIER.init().finally(() => {
      console.warn = origWarn;
    });
  }
  await initPromise;
}

interface PhysicsTune {
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
  density: number;
}

/** Per-weapon physics. Hand-picked defaults so each round feels distinct
 *  without burdening WeaponDef with engine-specific knobs yet.
 *  Linear damping is intentionally zero on flying rounds so server-side
 *  motion is the same Newtonian arc the client predicts — any damping
 *  introduces per-tick velocity decay that visible-diverges between
 *  server samples and produces the exact "jittery" flight we hit. */
function tuneForWeapon(weapon: WeaponId): PhysicsTune {
  const def = WEAPONS[weapon];
  if (def.bounces && def.restDetonate) {
    // Grenade: bouncy thud, heavy roll friction so it settles fast.
    return { restitution: 0.4, friction: 0.55, linearDamping: 0.0, angularDamping: 0.4, density: 1 };
  }
  if (def.bounces) {
    // Skipper: very bouncy, low friction so it skips across flat ground.
    return { restitution: 0.7, friction: 0.05, linearDamping: 0.0, angularDamping: 0.05, density: 1 };
  }
  // Shell-likes: detonate on contact; clean ballistics — no damping.
  return { restitution: 0.0, friction: 0.4, linearDamping: 0.0, angularDamping: 0.1, density: 1 };
}

export interface ProjectileHandle {
  bodyHandle: number;
  colliderHandle: number;
}

/** Wrapper around a Rapier 2D world configured for our screen-space
 *  coordinates (y-down, gravity = +900). One instance per BattleRoom. */
export class RapierIntegrator {
  readonly world: RAPIER.World;
  private readonly eventQueue: RAPIER.EventQueue;
  private terrainBody: RAPIER.RigidBody;
  private terrainCollider: RAPIER.Collider | null = null;
  /** colliderHandle → "ground" | bodyHandle. Lets us identify which side
   *  of a contact pair is a projectile vs the static terrain. */
  private colliderKind = new Map<number, "ground" | number>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: WORLD.GRAVITY });
    this.eventQueue = new RAPIER.EventQueue(true);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0);
    this.terrainBody = this.world.createRigidBody(bodyDesc);
  }

  /** (Re)build the terrain collider from the current 1-px-per-sample
   *  heights array. Called once at world creation, then again after every
   *  crater so projectiles see the new surface. */
  rebuildTerrain(heights: number[]): void {
    if (this.terrainCollider) {
      this.world.removeCollider(this.terrainCollider, false);
      this.colliderKind.delete(this.terrainCollider.handle);
      this.terrainCollider = null;
    }
    const verts = new Float32Array(heights.length * 2);
    for (let i = 0; i < heights.length; i++) {
      verts[2 * i] = i;
      verts[2 * i + 1] = heights[i]!;
    }
    const desc = RAPIER.ColliderDesc.polyline(verts)
      .setFriction(0.6)
      .setRestitution(0.0);
    this.terrainCollider = this.world.createCollider(desc, this.terrainBody);
    this.colliderKind.set(this.terrainCollider.handle, "ground");
  }

  createProjectile(
    weapon: WeaponId,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
  ): ProjectileHandle {
    const tune = tuneForWeapon(weapon);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y) // 2D positional form is still supported in 0.19
      .setLinvel(vx, vy)
      .setLinearDamping(tune.linearDamping)
      .setAngularDamping(tune.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setRestitution(tune.restitution)
      .setFriction(tune.friction)
      .setDensity(tune.density)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(colliderDesc, body);
    this.colliderKind.set(collider.handle, body.handle);
    return { bodyHandle: body.handle, colliderHandle: collider.handle };
  }

  removeProjectile(h: ProjectileHandle): void {
    const body = this.world.getRigidBody(h.bodyHandle);
    if (!body) return;
    this.colliderKind.delete(h.colliderHandle);
    this.world.removeRigidBody(body);
  }

  /** Translate body kinematics back into the wire format used by our
   *  schema. Fast path for the per-tick sync. */
  readState(h: ProjectileHandle): { x: number; y: number; vx: number; vy: number; speed: number } | null {
    const body = this.world.getRigidBody(h.bodyHandle);
    if (!body) return null;
    const t = body.translation();
    const v = body.linvel();
    return { x: t.x, y: t.y, vx: v.x, vy: v.y, speed: Math.hypot(v.x, v.y) };
  }

  /** Set linvel directly. Used to apply the room's horizontal wind every
   *  tick — adding it as a force was less responsive at our scale. */
  applyWind(h: ProjectileHandle, wind: number, dt: number): void {
    const body = this.world.getRigidBody(h.bodyHandle);
    if (!body) return;
    const v = body.linvel();
    body.setLinvel({ x: v.x + wind * dt, y: v.y }, true);
  }

  /** Step the world and return the set of projectile body handles that
   *  *started* a contact this step. Caller is responsible for
   *  bounces-left bookkeeping and detonation decisions. */
  step(dt: number): { contacts: Set<number> } {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
    const contacts = new Set<number>();
    this.eventQueue.drainCollisionEvents((h1: number, h2: number, started: boolean) => {
      if (!started) return;
      const k1 = this.colliderKind.get(h1);
      const k2 = this.colliderKind.get(h2);
      // Only flag projectile-vs-ground contacts here. Tank intersections
      // are still resolved AABB-side in World.step (tanks aren't in the
      // physics world).
      if (k1 === "ground" && typeof k2 === "number") contacts.add(k2);
      else if (k2 === "ground" && typeof k1 === "number") contacts.add(k1);
    });
    return { contacts };
  }

  dispose(): void {
    // Free the underlying WASM allocations. BattleRoom calls this on
    // dispose so a busy server doesn't leak per-match worlds.
    this.world.free();
  }
}
