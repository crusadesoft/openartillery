import {
  BattleState,
  BiomeId,
  FireTile,
  Player,
  TANK,
  WEAPONS,
  WORLD,
  WeaponId,
} from "@artillery/shared";
import { Terrain } from "./Terrain.js";
import {
  ProjectileBody,
  createProjectile,
  stepProjectiles,
} from "./Projectile.js";
import { applyBlastDamage, pruneFires, tickFires } from "./DamageResolver.js";

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export type ExplosionEvent = {
  x: number;
  y: number;
  radius: number;
  weapon: WeaponId;
  ownerId: string;
};

export interface DamageRecord {
  tankId: string;
  ownerId: string;
  weapon: WeaponId;
  amount: number;
  x: number;
  y: number;
  killed: boolean;
}

export interface StepTelemetry {
  explosions: ExplosionEvent[];
  damages: DamageRecord[];
  /** tank ids that died this tick */
  deaths: string[];
}

export class World {
  readonly terrain: Terrain;
  readonly projectiles = new Map<string, ProjectileBody>();
  private nextProjectileId = 1;
  private nextFireId = 1;
  /** Server-only side state for fire tiles: when each tile's next damage
   *  tick fires and how many hits it has left. Capping per-tile hits is
   *  what keeps napalm from melting a stationary tank — the schema-level
   *  `expiresAt` is only a duration backstop. */
  readonly fireMeta = new Map<string, { nextTickAt: number; hitsRemaining: number }>();

  constructor(public state: BattleState, seed: number, biome: BiomeId) {
    this.terrain = new Terrain(state.terrain, seed, biome);
  }

  spawnTankAt(player: Player, x: number): void {
    player.x = x;
    player.y = this.terrain.heightAt(x) - TANK.HEIGHT / 2;
  }

  settleTank(p: Player): void {
    // Live AND dead tanks track terrain so wrecks don't float when the
    // dirt under them is blown out.
    const ground = this.terrain.heightAt(p.x);
    const resting = ground - TANK.HEIGHT / 2;
    if (p.y < resting) p.y = Math.min(p.y + 6, resting);
    else p.y = resting;
    if (p.y > WORLD.HEIGHT + 100) {
      p.dead = true;
      p.hp = 0;
    }
  }

  settleAllTanks(): void {
    this.state.players.forEach((p) => this.settleTank(p));
  }

  applyInput(p: Player, input: Input, dt: number): void {
    if (p.dead) return;
    if (input.up) p.angle += TANK.AIM_RATE_DEG_PER_SEC * dt;
    if (input.down) p.angle -= TANK.AIM_RATE_DEG_PER_SEC * dt;
    p.angle = Math.max(TANK.MIN_ANGLE_DEG, Math.min(TANK.MAX_ANGLE_DEG, p.angle));

    // Movement. Tank body keeps its hull orientation regardless of drive
    // direction — only the turret (aim) flips the visual facing. Players who
    // back up shouldn't get whipped around 180° every tap.
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    if (dir !== 0 && p.fuel > 0 && !p.charging) {
      const dist = dir * 60 * dt;
      const nextX = Math.max(10, Math.min(WORLD.WIDTH - 10, p.x + dist));
      const moved = Math.abs(nextX - p.x);
      if (moved >= TANK.MIN_MOVE_STEP_PX) {
        // Sample the slope over a fixed lookahead equal to half the tank
        // body so per-pixel terrain noise can't veto legitimate drives.
        // Averaging three probe points (near/mid/far) further smooths it.
        const look = TANK.WIDTH / 2;
        const probeX = Math.max(
          0,
          Math.min(WORLD.WIDTH - 1, p.x + dir * look),
        );
        const h0 = this.terrain.heightAt(p.x);
        const hMid = this.terrain.heightAt(p.x + dir * (look * 0.5));
        const h1 = this.terrain.heightAt(probeX);
        // Screen-y increases downward: smaller h = taller peak, so climb
        // means h1 < h0. Use the shallowest of (mid, far) so a single
        // pixel noise spike doesn't veto movement.
        const minH = Math.min(hMid, h1);
        const climb = Math.max(0, h0 - minH);
        const tan = climb / look;
        if (tan > TANK.MAX_CLIMB_SLOPE) {
          // Too steep — tank stalls against the cliff. Do *not* burn fuel
          // or emit any effect that would suggest the tread engaged; the
          // player simply hasn't moved this tick.
          return;
        }
        const slopeCost = Math.abs(h1 - h0);
        const cost = moved * 0.35 + slopeCost * 0.2;
        if (cost <= p.fuel) {
          p.fuel -= cost;
          p.x = nextX;
          p.y = this.terrain.heightAt(p.x) - TANK.HEIGHT / 2;
        }
      }
    }

    if (p.charging) {
      p.power = Math.min(TANK.MAX_POWER, p.power + TANK.POWER_CHARGE_RATE * dt);
    }
  }

  barrelTip(p: Player): {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
  } {
    const angleRad = (p.angle * Math.PI) / 180;
    const dirX = Math.cos(angleRad) * p.facing;
    const dirY = -Math.sin(angleRad);
    // Pivot is where the drawn barrel sprite's origin sits in world space —
    // mirrored by facing so the math lines up with the mirrored sprite.
    const pivotX = p.x + TANK.BARREL_PIVOT_X * p.facing;
    const pivotY = p.y + TANK.BARREL_PIVOT_Y;
    // Each barrel style has its own visual length — use the player's so
    // long/sniper/stubby rounds spawn at the actual muzzle.
    const barrelLen =
      TANK.BARREL_LENGTHS[p.barrelStyle] ?? TANK.BARREL_LENGTH;
    return {
      x: pivotX + dirX * barrelLen,
      y: pivotY + dirY * barrelLen,
      dirX,
      dirY,
    };
  }

  fire(p: Player): {
    weapon: WeaponId;
    power: number;
    from: { x: number; y: number };
  } | null {
    if (p.dead || p.power < TANK.MIN_POWER) {
      p.power = 0;
      p.charging = false;
      return null;
    }
    const weapon = p.weapon as WeaponId;
    const tip = this.barrelTip(p);
    const speed = p.power;

    // Airstrike fires a single primary round, but on detonation spawns a few
    // vertical shells from above — handled in detonate().
    const vx = tip.dirX * speed;
    const vy = tip.dirY * speed - 30;
    this.spawnProjectile(p.id, weapon, tip.x, tip.y, vx, vy);
    const result = { weapon, power: p.power, from: { x: tip.x, y: tip.y } };
    // Intentionally preserve p.power so the next turn's aim starts where
    // the player last shot — lets them nudge from the known-good setup
    // instead of re-dialing from zero every round.
    p.charging = false;
    return result;
  }

  private spawnProjectile(
    ownerId: string,
    weapon: WeaponId,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ProjectileBody {
    const id = `proj_${this.nextProjectileId++}`;
    const body = createProjectile(id, ownerId, weapon, x, y, vx, vy);
    this.projectiles.set(id, body);
    this.state.projectiles.set(id, body.state);
    return body;
  }

  step(dt: number): StepTelemetry {
    pruneFires(this.state, Date.now(), this.fireMeta);
    const explosions: ExplosionEvent[] = [];
    const damages: DamageRecord[] = [];
    const deaths: string[] = [];

    // Apply napalm damage over time.
    if (this.state.fires.size > 0) {
      tickFires(
        this.state,
        (x) => this.terrain.heightAt(x),
        damages,
        deaths,
        this.fireMeta,
      );
    }

    if (this.projectiles.size > 0) {
      const result = stepProjectiles(
        this.projectiles.values(),
        this.terrain,
        this.state.wind,
        dt,
      );

      // Tank AABB intersection counts as an impact.
      for (const body of this.projectiles.values()) {
        this.state.players.forEach((p) => {
          if (p.dead) return;
          const dx = body.state.x - p.x;
          const dy = body.state.y - p.y;
          if (
            Math.abs(dx) < TANK.WIDTH / 2 + body.state.radius &&
            Math.abs(dy) < TANK.HEIGHT / 2 + body.state.radius
          ) {
            result.impacts.push({ body, x: body.state.x, y: body.state.y });
          }
        });
      }

      // Resolve MIRV splits — remove parent, fan out children.
      for (const parent of result.splits) {
        this.removeProjectile(parent.state.id);
        const def = WEAPONS[parent.weapon];
        if (!def.mirv) continue;
        const { count, child, spread } = def.mirv;
        const vx = parent.state.vx;
        const vy = parent.state.vy;
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count - 0.5;
          const deg = t * 40; // ±20° fan around parent heading
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const cvx = vx * cos - vy * sin + (Math.random() - 0.5) * spread * 0.2;
          const cvy = vx * sin + vy * cos;
          this.spawnProjectile(
            parent.state.ownerId,
            child,
            parent.state.x,
            parent.state.y,
            cvx,
            cvy,
          );
        }
      }

      const detonated = new Set<string>();
      for (const impact of result.impacts) {
        if (detonated.has(impact.body.state.id)) continue;
        detonated.add(impact.body.state.id);
        this.detonate(impact.body, impact.x, impact.y, {
          explosions,
          damages,
          deaths,
        });
      }
      for (const off of result.offscreen) {
        this.removeProjectile(off.state.id);
      }
    }

    return { explosions, damages, deaths };
  }

  private detonate(
    body: ProjectileBody,
    x: number,
    y: number,
    out: StepTelemetry,
  ): void {
    const def = WEAPONS[body.weapon];

    this.removeProjectile(body.state.id);

    if (def.addsTerrain) {
      this.terrain.mound(x, y, def.radius);
    } else {
      this.terrain.explode(x, y, def.radius * def.digFactor);
    }

    applyBlastDamage(this.state, body, x, y, def.radius, def.damage, out);

    out.explosions.push({
      x,
      y,
      radius: def.radius,
      weapon: body.weapon,
      ownerId: body.state.ownerId,
    });

    // Cluster sub-munitions.
    if (def.cluster) {
      const { count, child, spread } = def.cluster;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * (i + 0.5)) / count + Math.PI;
        const svx = Math.cos(a) * spread;
        const svy = Math.sin(a) * spread;
        this.spawnProjectile(body.state.ownerId, child, x, y - 4, svx, svy);
      }
    }

    // Airstrike: spawn `count` vertical shells at the top of the world
    // and let them fall all the way down. The visual interest is the
    // whole arc — camera should pan up to frame them (see BattleScene
    // camera follow).
    if (def.airstrike) {
      const { count, spacing } = def.airstrike;
      const altitude = -Math.max(80, def.airstrike.altitude);
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        const sx = x + offset + (Math.random() - 0.5) * 12;
        this.spawnProjectile(
          body.state.ownerId,
          "heavy",
          sx,
          altitude,
          0,
          200 + Math.random() * 80,
        );
      }
    }

    // Napalm: drop lingering fire tiles in an arc around impact.
    if (def.napalm) {
      const n = def.napalm;
      const half = (n.tileCount - 1) / 2;
      for (let i = 0; i < n.tileCount; i++) {
        const offset = (i - half) * (n.radius / 3);
        const sx = x + offset;
        const sy = this.terrain.heightAt(sx) - 10;
        const id = `fire_${this.nextFireId++}`;
        const tile = new FireTile();
        tile.id = id;
        tile.ownerId = body.state.ownerId;
        tile.x = sx;
        tile.y = sy;
        tile.radius = n.radius * 0.35;
        tile.expiresAt = Date.now() + n.durationSec * 1000;
        this.state.fires.set(id, tile);
        this.fireMeta.set(id, {
          nextTickAt: Date.now() + 500,
          hitsRemaining: 3,
        });
      }
    }
  }

  private removeProjectile(id: string): void {
    this.projectiles.delete(id);
    this.state.projectiles.delete(id);
  }

  hasLiveProjectiles(): boolean {
    // Active fire tiles count as in-flight combat — the turn shouldn't
    // advance while napalm is still ticking damage on the firing player.
    return this.projectiles.size > 0 || this.state.fires.size > 0;
  }

  /** Force-clear any projectiles still in flight. Used as a safety net
   *  when a turn has been stuck past its timeout — better to advance
   *  than to let the match freeze. */
  clearProjectiles(): void {
    for (const id of Array.from(this.projectiles.keys())) {
      this.removeProjectile(id);
    }
    this.state.fires.clear();
    this.fireMeta.clear();
  }
}
