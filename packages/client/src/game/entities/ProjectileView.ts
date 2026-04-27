import Phaser from "phaser";
import type { Projectile, WeaponId } from "@artillery/shared";

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

/** How far behind the latest server snapshot we render, in milliseconds.
 *  At PATCH_HZ=30 (33 ms intervals), 75 ms keeps ~2 snapshots ahead of
 *  the render cursor at all times — robust to a missed patch and still
 *  imperceptible for ballistic flight. */
const RENDER_DELAY_MS = 75;

/** Max snapshots retained per projectile. Keeps memory bounded; ~10
 *  covers ~330 ms of history, well past the render-delay window. */
const BUFFER_LIMIT = 10;

interface Snapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** state.serverTime at the moment this snapshot's values applied. */
  serverTime: number;
}

/**
 * Pure-playback projectile view. Holds a small buffer of authoritative
 * server snapshots tagged with `state.serverTime`, then renders at
 * `serverTimeNow − RENDER_DELAY_MS` by lerping between the two
 * snapshots that bracket that moment. Has no physics knowledge — it
 * doesn't care whether the server uses Rapier, hand-rolled Euler, or
 * something we haven't invented yet. The same module would render
 * tank or fire-tile playback unchanged if we wanted to extend it.
 */
export class ProjectileView {
  readonly sprite: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  /** FIFO buffer, oldest first. */
  private buf: Snapshot[] = [];
  /** Wall clock at the moment we last received a snapshot — paired with
   *  the latest snapshot's serverTime to advance the playback cursor at
   *  real rate between patches. */
  private lastSyncWall = 0;

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

  /** Append a fresh server snapshot. Called every render frame, but
   *  only writes to the buffer when one of the watched fields actually
   *  changed (i.e. a patch landed). `serverTime` is the room-level
   *  timeline; pass `state.serverTime` from the BattleState. */
  maybeSync(p: Projectile, serverTime: number): void {
    this.state = p;
    const last = this.buf[this.buf.length - 1];
    if (
      last &&
      p.x === last.x && p.y === last.y &&
      p.vx === last.vx && p.vy === last.vy
    ) return;
    this.buf.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, serverTime });
    if (this.buf.length > BUFFER_LIMIT) this.buf.shift();
    this.lastSyncWall = performance.now();
  }

  step(_dt: number, _wind: number): void {
    if (this.buf.length === 0) return;
    const last = this.buf[this.buf.length - 1]!;

    // Estimate "now" on the server clock by extrapolating real time
    // forward from the last patch's serverTime. Tick-rate variance gets
    // absorbed automatically — irregular wall arrival just means the
    // render cursor sometimes leads or lags actual server time by a
    // few ms, but the snapshot buffer is timeline-correct either way.
    const estServerTime = last.serverTime + (performance.now() - this.lastSyncWall);
    const renderTime = estServerTime - RENDER_DELAY_MS;

    // Find the bracketing pair: largest snapshot ≤ renderTime and the
    // next one after it. Walk from newest backward — the cursor sits
    // near the tail in steady state so this terminates in O(1).
    let from: Snapshot = this.buf[0]!;
    let to: Snapshot = this.buf[0]!;
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (this.buf[i]!.serverTime <= renderTime) {
        from = this.buf[i]!;
        to = this.buf[i + 1] ?? from;
        break;
      }
    }
    if (renderTime > last.serverTime) {
      // Render cursor has run past every snapshot in the buffer (a
      // missed patch). Hold on the latest — better to freeze for one
      // frame than to extrapolate physics we don't model here.
      from = to = last;
    }

    const span = to.serverTime - from.serverTime;
    const u = span > 0 ? Math.max(0, Math.min(1, (renderTime - from.serverTime) / span)) : 0;
    const x = from.x + (to.x - from.x) * u;
    const y = from.y + (to.y - from.y) * u;
    const vx = from.vx + (to.vx - from.vx) * u;
    const vy = from.vy + (to.vy - from.vy) * u;

    this.sprite.setPosition(x, y);
    this.sprite.setRotation(Math.atan2(vy, vx));
    if (this.trail) this.trail.setPosition(x, y);
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
