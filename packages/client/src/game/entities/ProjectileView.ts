import Phaser from "phaser";
import type { Projectile, WeaponId } from "@artillery/shared";
import { WORLD } from "@artillery/shared";

/** Texture key + display footprint per weapon. Sized so the round reads
 *  clearly in-flight (~20-36px wide) without being comically huge. */
const PROJ_ART: Record<WeaponId, { tex: string; w: number; h: number }> = {
  shell:     { tex: "proj_shell",     w: 28, h: 12 },
  heavy:     { tex: "proj_heavy",     w: 36, h: 16 },
  cluster:   { tex: "proj_cluster",   w: 26, h: 18 },
  dirt:      { tex: "proj_dirt",      w: 22, h: 22 },
  skipper:   { tex: "proj_skipper",   w: 24, h: 12 },
  grenade:   { tex: "proj_grenade",   w: 20, h: 22 },
  napalm:    { tex: "proj_napalm",    w: 26, h: 16 },
  airstrike: { tex: "proj_airstrike", w: 34, h: 14 },
  mirv:      { tex: "proj_mirv",      w: 34, h: 18 },
};

/**
 * Smoothed projectile view. The server broadcasts state at ~20 Hz — at
 * 60 fps rendering the sprite visibly "teleports" every 50 ms if we just
 * snap to server positions. Instead we extrapolate with the last known
 * velocity between snapshots and snap softly when a fresh one arrives.
 */
export class ProjectileView {
  readonly sprite: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  // Locally simulated position / velocity, corrected by server snaps.
  private lx = 0;
  private ly = 0;
  private lvx = 0;
  private lvy = 0;
  /** Last server-authoritative sample we blended toward. */
  private lastSync = { x: 0, y: 0, vx: 0, vy: 0 };

  constructor(scene: Phaser.Scene, public state: Projectile) {
    const art = PROJ_ART[state.weapon as WeaponId] ?? PROJ_ART.shell;
    this.sprite = scene.add
      .image(state.x, state.y, art.tex)
      .setDisplaySize(art.w, art.h)
      // Anchor near the trailing edge so the projectile reads as
      // "emerging from the muzzle" instead of being half-swallowed by
      // the barrel at spawn. 0.25 keeps a little overlap so in-flight
      // the shell's centre of mass is still near its physics position.
      .setOrigin(0.25, 0.5)
      .setDepth(6);
    this.lx = state.x;
    this.ly = state.y;
    this.lvx = state.vx;
    this.lvy = state.vy;
    this.lastSync = { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
    this.trail = scene.add
      .particles(state.x, state.y, "spark", {
        lifespan: 320,
        speed: { min: 0, max: 20 },
        scale: { start: 0.6, end: 0 },
        tint: [state.tint, 0xffffff],
        frequency: 18,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(5);
  }

  /** Called every frame, but only reconciles when the server's snapshot
   *  actually changed since last blend. */
  maybeSync(p: Projectile): void {
    this.state = p;
    if (
      p.x === this.lastSync.x && p.y === this.lastSync.y &&
      p.vx === this.lastSync.vx && p.vy === this.lastSync.vy
    ) return;
    const dx = p.x - this.lx;
    const dy = p.y - this.ly;
    const err = Math.hypot(dx, dy);
    if (err > 60) {
      this.lx = p.x;
      this.ly = p.y;
    } else {
      this.lx += dx * 0.5;
      this.ly += dy * 0.5;
    }
    this.lvx = p.vx;
    this.lvy = p.vy;
    this.lastSync.x = p.x;
    this.lastSync.y = p.y;
    this.lastSync.vx = p.vx;
    this.lastSync.vy = p.vy;
  }

  /** Integrate forward by `dt` seconds (called each Phaser frame). */
  step(dt: number, wind: number): void {
    this.lvx += wind * dt;
    this.lvy += WORLD.GRAVITY * dt;
    this.lx += this.lvx * dt;
    this.ly += this.lvy * dt;
    this.sprite.setPosition(this.lx, this.ly);
    this.sprite.setRotation(Math.atan2(this.lvy, this.lvx));
    if (this.trail) this.trail.setPosition(this.lx, this.ly);
  }

  destroy(): void {
    this.sprite.destroy();
    if (this.trail) {
      this.trail.stop();
      this.trail.destroy();
      this.trail = null;
    }
  }
}
