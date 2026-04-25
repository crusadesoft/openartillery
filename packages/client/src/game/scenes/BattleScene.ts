import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import {
  BattleState,
  type BiomeId,
  DEFAULT_LOADOUT,
  DEFAULT_ITEMS,
  ITEM_TUNING,
  type ItemId,
  TARGETED_ITEMS,
  FireTile,
  Player,
  Projectile,
  ServerEvent,
  TANK,
  WORLD,
  WEAPONS,
} from "@artillery/shared";
import { Sound } from "../audio/Sound";
import { TankView, getTankPreviewTextures } from "../entities/Tank";
import { TerrainView } from "../entities/TerrainView";
import { ProjectileView } from "../entities/ProjectileView";
import { FireView } from "../entities/FireView";

const MAX_DRAG_PX = 260;

/** True when the user is typing in an HTML form — suppresses game hotkeys. */
function isTypingInForm(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export class BattleScene extends Phaser.Scene {
  private room!: Room<BattleState>;
  private terrainView!: TerrainView;
  private tanks = new Map<string, TankView>();
  private projectiles = new Map<string, ProjectileView>();
  private fires = new Map<string, FireView>();
  /** Active speech bubbles keyed by player.id. Each updates its position
   *  every frame to track the tank and fades after a few seconds. */
  private speechBubbles = new Map<string, {
    container: Phaser.GameObjects.Container;
    ownerId: string;
    expireAt: number;
  }>();

  private stars!: Phaser.GameObjects.Group;
  private skyLayers: Phaser.GameObjects.GameObject[] = [];
  /** Sprites that drift horizontally each frame and wrap around the
   *  world. Populated by drawStars() per biome. Cleared with skyLayers. */
  private driftClouds: { sprite: Phaser.GameObjects.Image; vx: number; w: number }[] = [];
  private aimLine!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private dragOverlay!: Phaser.GameObjects.Graphics;
  private lastArcGfx!: Phaser.GameObjects.Graphics;
  private aimLabel?: Phaser.GameObjects.Text;
  private cursorPreview?: {
    container: Phaser.GameObjects.Container;
    hull: Phaser.GameObjects.Image;
    barrel: Phaser.GameObjects.Image;
    barrelOffsetX: number;
    barrelOffsetY: number;
    loadoutKey: string;
  };
  private windEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private cursorOnCanvas = false;
  private cursorScreenX = 0;
  private lowTimePlayedForTurn = false;

  /** World-space trajectory trace of the local player's last completed
   *  shot. Drawn as a faint dotted line during subsequent aim so the
   *  player can reference their previous arc without the game leaking
   *  predictions — the line only appears *after* the first shot. */
  private lastArc: { x: number; y: number }[] | null = null;
  /** Projectile ID currently being recorded for `lastArc`. */
  private trackedProjectileId: string | null = null;
  /** Trajectory samples for the in-flight recording. */
  private activeArc: { x: number; y: number }[] = [];
  /** Snapshot of the firing state captured when the tracked projectile
   *  first appears. Used to re-draw the previous shot's aim arrow so
   *  the player can reference angle/power/position visually. */
  private lastShot: {
    tankX: number;
    tankY: number;
    angle: number;
    power: number;
    facing: -1 | 1;
  } | null = null;
  /** True once we've captured the arc for the current turn — blocks
   *  re-tracking of sub-munitions (cluster bomblets, MIRV warheads,
   *  airstrike fall-ins) so the saved arc always shows the primary
   *  round, not the last child to land. */
  private arcCapturedThisTurn = false;

  /** Raw DOM-tracked key state. We bypass Phaser's key plugin so the
   *  game never interferes with keystrokes meant for a focused input. */
  private pressed = new Set<string>();
  private domKeyDown!: (e: KeyboardEvent) => void;
  private domKeyUp!: (e: KeyboardEvent) => void;

  // Mouse-drag aim state.
  private dragging = false;
  private localAngleDeg = 45;
  private localPower = 0;
  private localFacing: -1 | 1 = 1;
  private lastAimSentAt = 0;
  private moveDir: -1 | 0 | 1 = 0;
  /** Last observed x for the local tank — used to detect whether the
   *  server actually advanced us this frame so the tread sound only plays
   *  while we're rolling, not while the hull is stuck against a cliff. */
  private lastSelfX = Number.NaN;
  private lastMoveAt = 0;
  /** World-space cursor pos when the current drag began. */
  private dragAnchorCursor = { x: 0, y: 0 };
  /** Virtual aim-tip (world-space) at drag start — cursor delta is added
   *  to this, and angle/power are derived from tip − tank. Gives a
   *  "grab the handle where it is" feel instead of jumping to click. */
  private dragAnchorTip = { x: 0, y: 0 };

  /** When set, the next click picks a target for this item instead of
   *  aiming. UI dispatches `artillery:target-item` to enter this mode;
   *  ESC or right-click cancels. */
  private targetingItem: ItemId | null = null;
  private targetGfx?: Phaser.GameObjects.Graphics;
  private domTargetEvt!: (e: Event) => void;

  constructor() {
    super({ key: "battle" });
  }

  create(): void {
    this.room = this.game.registry.get("room") as Room<BattleState>;
    Sound.init();

    // Allow the camera to scroll above y=0 so airstrike shells (and any
    // other top-of-world spawns) stay visible during their fall.
    this.cameras.main.setBounds(0, -300, WORLD.WIDTH, WORLD.HEIGHT + 300);
    this.matter.world.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const biome = (this.room.state.biome as BiomeId) || "grasslands";
    this.terrainView = new TerrainView(this, this.room.state.terrain, biome);

    this.drawStars(biome);
    this.lastArcGfx = this.add.graphics().setDepth(11);
    this.aimLine = this.add.graphics().setDepth(12);
    this.reticle = this.add.graphics().setDepth(13);
    this.dragOverlay = this.add.graphics().setDepth(14).setScrollFactor(0);
    this.targetGfx = this.add.graphics().setDepth(15);

    this.windEmitter = this.add
      .particles(0, 0, "spark", {
        lifespan: 4500,
        speedX: 0,
        speedY: { min: -6, max: 6 },
        scale: { start: 0.22, end: 0.06 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xefe8d6, 0xd4ccb6, 0xb8af96],
        blendMode: Phaser.BlendModes.NORMAL,
        quantity: 1,
        frequency: 80,
        x: { min: 0, max: WORLD.WIDTH },
        y: { min: 40, max: WORLD.HEIGHT - 80 },
        emitting: false,
      })
      .setDepth(2);

    this.setupInput();
    this.wireRoom();

    // Snap straight to the local player on scene boot so the very
    // first frame is centered on us, then defer to updateCamera /
    // turn-event pans. Falls back to whoever's turn it is, then
    // world-centre, if our tank isn't in state yet.
    const me = this.room.state.players.get(this.room.sessionId);
    const cur = this.room.state.players.get(this.room.state.currentTurnId);
    const focal = me ?? cur;
    if (focal) this.cameras.main.centerOn(focal.x, focal.y - 60);
    else this.cameras.main.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
  }

  override update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.terrainView.update();
    this.pollMoveKeys();
    this.updateTreadAudio(time);

    const heights = this.room.state.terrain.heights;
    this.room.state.players.forEach((p) => {
      const view = this.tanks.get(p.id);
      if (!view) return;
      const left =
        heights[Math.max(0, Math.floor(p.x - 14))] ?? p.y;
      const right =
        heights[Math.min(heights.length - 1, Math.floor(p.x + 14))] ?? p.y;
      const slopeDeg = Math.max(
        -26,
        Math.min(26, (Math.atan2(right - left, 28) * 180) / Math.PI),
      );
      view.sync(p, p.id === this.room.state.currentTurnId, slopeDeg);
    });
    this.room.state.projectiles.forEach((pr) => {
      const view = this.projectiles.get(pr.id);
      if (!view) return;
      view.maybeSync(pr);
      view.step(dt, this.room.state.wind);
    });
    this.updateWindParticles();
    this.updateDriftClouds(dt);
    this.checkLowTimeWarning();
    this.room.state.fires.forEach((f) => {
      const view = this.fires.get(f.id);
      if (view) view.sync(f);
    });
    this.recordActiveArc();

    this.renderLastArc();
    this.renderAim();
    this.renderTargeting();
    this.updateCamera(dt);
    this.updateSpeechBubbles(time);
  }

  private checkLowTimeWarning(): void {
    if (this.lowTimePlayedForTurn) return;
    if (!this.isMyTurn()) return;
    const endsAt = this.room.state.turnEndsAt;
    if (endsAt <= 0) return;
    const remaining = endsAt - Date.now();
    if (remaining > 0 && remaining <= 5000) {
      Sound.play("low_time");
      this.lowTimePlayedForTurn = true;
    }
  }

  private updateDriftClouds(dt: number): void {
    if (this.driftClouds.length === 0) return;
    const wind = this.room.state.wind;
    // Even at zero wind clouds keep a faint baseline drift, so the sky
    // doesn't feel frozen on calm rounds. Wind shifts direction + speed.
    const baseline = 6; // px/s rightward when wind is 0
    const windFactor = 0.6; // wind units → px/s
    for (const c of this.driftClouds) {
      const speed = (baseline + wind * windFactor) * c.vx;
      let nx = c.sprite.x + speed * dt;
      const margin = c.w * 0.6 + 40;
      // Wrap around the world horizontally so clouds drift forever.
      if (nx > WORLD.WIDTH + margin) nx -= WORLD.WIDTH + margin * 2;
      else if (nx < -margin) nx += WORLD.WIDTH + margin * 2;
      c.sprite.x = nx;
    }
  }

  private updateWindParticles(): void {
    const e = this.windEmitter;
    const wind = this.room.state.wind;
    const mag = Math.abs(wind);
    const max = this.room.state.windMax || 25;
    Sound.setWind(Math.min(1, mag / max));
    if (!e) return;
    if (mag < 0.5) {
      if (e.emitting) e.stop();
      return;
    }
    if (!e.emitting) e.start();
    e.setParticleSpeed(wind * 14, undefined);
    e.frequency = Math.max(20, 140 - mag * 4);
  }

  /** Appends the tracked projectile's current position to `activeArc`,
   *  throttled by distance so we don't store hundreds of samples per
   *  second. The arc is fixed once the projectile is removed. */
  private recordActiveArc(): void {
    if (this.trackedProjectileId === null) return;
    const p = this.room.state.projectiles.get(this.trackedProjectileId);
    if (!p) return;
    const last = this.activeArc[this.activeArc.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 10) {
      this.activeArc.push({ x: p.x, y: p.y });
    }
  }

  /** Draws the faded dotted trace of the player's most recent completed
   *  shot so they can see where the last round went. Drawn only during
   *  their own turn; never for enemies, and only after a real shot has
   *  resolved (no arc shown on round one). */
  private renderLastArc(): void {
    this.lastArcGfx.clear();
    if (!this.lastArc || this.lastArc.length < 3) return;
    if (!this.isMyTurn()) return;
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self || self.dead) return;
    // Dashed trace — resample the arc into small constant-length sub-
    // segments, then draw only the ones whose midpoint lies inside a
    // "dash" window. Off-white reads cleanly on both green (grasslands)
    // and rust (desert) terrain.
    const color = 0xf0ecdc;
    const alpha = 0.82;
    const STEP = 2;
    const DASH_LEN = 7;
    const GAP_LEN = 5;
    const CYCLE = DASH_LEN + GAP_LEN;
    this.lastArcGfx.lineStyle(1.8, color, alpha);
    let totalDist = 0;
    for (let i = 1; i < this.lastArc.length; i++) {
      const a = this.lastArc[i - 1]!;
      const b = this.lastArc[i]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 0.1) continue;
      const steps = Math.max(1, Math.ceil(segLen / STEP));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const subLen = segLen / steps;
        const midDist = totalDist + subLen / 2;
        if (midDist % CYCLE < DASH_LEN) {
          this.lastArcGfx.lineBetween(
            a.x + (b.x - a.x) * t0,
            a.y + (b.y - a.y) * t0,
            a.x + (b.x - a.x) * t1,
            a.y + (b.y - a.y) * t1,
          );
        }
        totalDist += subLen;
      }
    }
    // Landing pin — same off-white so it reads as a set.
    const last = this.lastArc[this.lastArc.length - 1]!;
    this.lastArcGfx.lineStyle(1.6, color, 0.9);
    this.lastArcGfx.strokeCircle(last.x, last.y, 5);
    this.lastArcGfx.fillStyle(color, 0.95);
    this.lastArcGfx.fillCircle(last.x, last.y, 1.8);

    // Previous-shot aim arrow — drawn from the tank's position at the
    // time of firing, using the same geometry as the live aim arrow.
    // Suppressed while actively dragging so the player isn't comparing
    // two arrows from slightly different anchor points.
    if (this.lastShot && !this.dragging) {
      const { tankX, tankY, angle, power, facing } = this.lastShot;
      const barrelLen =
        TANK.BARREL_LENGTHS[self.barrelStyle] ?? TANK.BARREL_LENGTH;
      const angleRad = (angle * Math.PI) / 180;
      const dirX = Math.cos(angleRad) * facing;
      const dirY = -Math.sin(angleRad);
      // Match the live arrow: read pivot from the rendered TankView so
      // the historical arrow lands at the same place the new arrow does.
      const view = this.tanks.get(this.room.sessionId);
      const pivotX = view?.barrelOffsetX ?? TANK.BARREL_PIVOT_X;
      const pivotY = view?.barrelOffsetY ?? TANK.BARREL_PIVOT_Y;
      const baseX = tankX + pivotX * facing + dirX * barrelLen;
      const baseY = tankY + pivotY + dirY * barrelLen;
      const powerT = Math.max(
        0,
        Math.min(1, (power - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER)),
      );
      const arrowLen = 40 + powerT * 90;
      const tipX = baseX + dirX * arrowLen;
      const tipY = baseY + dirY * arrowLen;
      this.lastArcGfx.lineStyle(2, color, 0.6);
      this.lastArcGfx.lineBetween(baseX, baseY, tipX, tipY);
      const perpX = -dirY;
      const perpY = dirX;
      this.lastArcGfx.fillStyle(color, 0.7);
      this.lastArcGfx.fillTriangle(
        tipX + dirX * 7, tipY + dirY * 7,
        tipX - dirX * 3 + perpX * 4.5, tipY - dirY * 3 + perpY * 4.5,
        tipX - dirX * 3 - perpX * 4.5, tipY - dirY * 3 - perpY * 4.5,
      );
    }
  }

  private drawStars(biome: BiomeId): void {
    // Tear down previous layers (biome switch).
    this.stars?.clear(true, true);
    for (const obj of this.skyLayers) obj.destroy();
    this.skyLayers = [];
    this.driftClouds = [];
    this.stars = this.add.group();

    // Sky gradient + mountains come from `TerrainView`. Here we layer
    // decorative atmosphere *on top* of those: haze, sun/moon, clouds,
    // stars.
    const palettes: Record<BiomeId, { sun: number; haze: number; cloud: number }> = {
      grasslands: { sun: 0xffe2a8, haze: 0xc4d4c0, cloud: 0xe8e6dc },
      desert:     { sun: 0xfff2c8, haze: 0xe7c49a, cloud: 0xe0b570 },
      arctic:     { sun: 0xeadffa, haze: 0xd4e1ef, cloud: 0xc4d6ea },
      lava:       { sun: 0xff7030, haze: 0xa03020, cloud: 0x702820 },
      dusk:       { sun: 0xffb570, haze: 0xc06a80, cloud: 0xff9a70 },
    };
    const pal = palettes[biome] ?? palettes.grasslands;
    const skyH = WORLD.HEIGHT * 0.62;

    // Haze band just above the horizon — softens where sky meets terrain.
    const haze = this.add.graphics();
    haze.fillStyle(pal.haze, 0.35);
    haze.fillRect(0, skyH * 0.82, WORLD.WIDTH, skyH * 0.3);
    haze.setDepth(-2.5);
    haze.setScrollFactor(0.18);
    this.skyLayers.push(haze);

    // Sun / moon disc with a warm halo. On day biomes we use the sun
    // halo texture (warm blended glow); on night-feel biomes a moon.
    const sunX = biome === "dusk" ? WORLD.WIDTH * 0.22 : WORLD.WIDTH * 0.78;
    const sunY = skyH * (biome === "lava" ? 0.16 : 0.24);
    const halo = this.add
      .image(sunX, sunY, "sun_halo")
      .setAlpha(biome === "lava" ? 0.75 : 0.55)
      .setTint(pal.sun)
      .setScale(biome === "lava" ? 2.4 : 1.7)
      .setDepth(-3)
      .setScrollFactor(0.15)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.skyLayers.push(halo);
    if (biome === "arctic" || biome === "grasslands") {
      const moon = this.add
        .image(sunX, sunY, "moon")
        .setScale(0.9)
        .setDepth(-2.8)
        .setScrollFactor(0.15);
      this.skyLayers.push(moon);
    } else {
      // Warm sun disc for desert / lava / dusk / rock biomes.
      const disc = this.add.graphics();
      disc.fillStyle(pal.sun, 0.92);
      disc.fillCircle(0, 0, biome === "lava" ? 26 : 22);
      disc.fillStyle(0xffffff, 0.25);
      disc.fillCircle(-4, -4, biome === "lava" ? 16 : 12);
      disc.setPosition(sunX, sunY);
      disc.setDepth(-2.8);
      disc.setScrollFactor(0.15);
      this.skyLayers.push(disc);
    }

    // Distant pointy mountains on the horizon — broad parallax band
    // tinted to the biome's haze so they recede into atmosphere.
    const rng = Phaser.Math.RND;
    if (biome === "grasslands" || biome === "dusk" || biome === "arctic") {
      const farMtn = this.add
        .tileSprite(WORLD.WIDTH / 2, skyH * 0.86, WORLD.WIDTH, 168, "mountains_pointy")
        .setOrigin(0.5, 1)
        .setAlpha(0.55)
        .setTint(pal.haze)
        .setDepth(-2.6)
        .setScrollFactor(0.22);
      this.skyLayers.push(farMtn);
    } else if (biome === "desert" || biome === "lava") {
      const farMtn = this.add
        .tileSprite(WORLD.WIDTH / 2, skyH * 0.86, WORLD.WIDTH, 168, "mountains_pointy")
        .setOrigin(0.5, 1)
        .setAlpha(0.5)
        .setTint(biome === "lava" ? 0x4a1810 : 0xb88550)
        .setDepth(-2.6)
        .setScrollFactor(0.22);
      this.skyLayers.push(farMtn);
    }

    // Discrete chunky mountains scattered between the pointy band and
    // the procedural mountainNear layer. Skipped on lava so we don't
    // crowd out the embers.
    if (biome !== "lava") {
      const mtnKeys = ["mountain_1", "mountain_2", "mountain_3"];
      const mtnCount = biome === "arctic" || biome === "grasslands" ? 4 : 3;
      const mtnTint =
        biome === "arctic" ? 0xc9d8e8 :
        biome === "desert" ? 0xc89360 :
        biome === "dusk"   ? 0x6a4a6a :
        0x6c7466;
      for (let i = 0; i < mtnCount; i++) {
        const key = mtnKeys[Math.floor(Math.random() * mtnKeys.length)]!;
        const cx = (i + 0.5) * (WORLD.WIDTH / mtnCount) + rng.between(-160, 160);
        const cy = skyH * 0.92;
        const m = this.add
          .image(cx, cy, key)
          .setOrigin(0.5, 1)
          .setAlpha(0.65)
          .setTint(mtnTint)
          .setScale(0.6 + Math.random() * 0.4)
          .setDepth(-2.4)
          .setScrollFactor(0.32);
        this.skyLayers.push(m);
      }
    }

    // Far drifting clouds (Kenney "Flat" variants) — smaller, more
    // washed out, parallax further from the camera. Drift continuously
    // (no yoyo) and pick up direction + speed from world wind.
    if (biome !== "lava") {
      const farKeys = ["cloud_far_1", "cloud_far_2", "cloud_far_3", "cloud_far_4", "cloud_far_5"];
      const nFar = biome === "desert" ? 6 : 10;
      for (let i = 0; i < nFar; i++) {
        const key = farKeys[Math.floor(Math.random() * farKeys.length)]!;
        const cx = rng.between(0, WORLD.WIDTH);
        const cy = rng.between(skyH * 0.08, skyH * 0.35);
        const scale = 0.45 + Math.random() * 0.35;
        const c = this.add
          .image(cx, cy, key)
          .setAlpha(0.4 + Math.random() * 0.2)
          .setTint(pal.cloud)
          .setScale(scale)
          .setDepth(-1.8)
          .setScrollFactor(0.3);
        this.skyLayers.push(c);
        this.driftClouds.push({ sprite: c, vx: 0.25 + Math.random() * 0.2, w: c.displayWidth });
      }
    }

    // Hills sprite-strip across the horizon — sits in front of the
    // mid-distance mountains, behind the procedural ground silhouette.
    if (biome === "grasslands" || biome === "dusk") {
      const hillsKey = Math.random() < 0.5 ? "hills_1" : "hills_2";
      const hills = this.add
        .tileSprite(WORLD.WIDTH / 2, skyH * 0.96, WORLD.WIDTH, 128, hillsKey)
        .setOrigin(0.5, 1)
        .setAlpha(0.85)
        .setTint(biome === "dusk" ? 0x5a3a52 : 0x7e9462)
        .setDepth(-1.9)
        .setScrollFactor(0.5);
      this.skyLayers.push(hills);
    }

    // Distant trees scattered along the horizon for grasslands.
    if (biome === "grasslands") {
      const treeKeys = ["tree_1", "tree_2", "tree_3", "tree_4"];
      const treeCount = 7;
      for (let i = 0; i < treeCount; i++) {
        const key = treeKeys[Math.floor(Math.random() * treeKeys.length)]!;
        const cx = rng.between(0, WORLD.WIDTH);
        const cy = skyH * 0.97;
        const t = this.add
          .image(cx, cy, key)
          .setOrigin(0.5, 1)
          .setAlpha(0.7)
          .setTint(0x4a6a3c)
          .setScale(0.35 + Math.random() * 0.25)
          .setDepth(-1.7)
          .setScrollFactor(0.45);
        this.skyLayers.push(t);
      }
    }

    // Near drifting clouds — painted Kenney variants. Sit between the
    // far and near mountain layers so they read as mid-distance and
    // respect parallax. Drift continuously and pick up wind direction
    // from BattleScene.update().
    if (biome !== "lava") {
      const n = biome === "desert" ? 5 : 8;
      const cloudKeys = ["cloud_1", "cloud_2", "cloud_3", "cloud_4", "cloud_5"];
      for (let i = 0; i < n; i++) {
        const key = cloudKeys[Math.floor(Math.random() * cloudKeys.length)]!;
        const cx = rng.between(0, WORLD.WIDTH);
        const cy = rng.between(skyH * 0.2, skyH * 0.55);
        const c = this.add
          .image(cx, cy, key)
          .setAlpha(0.65 + Math.random() * 0.25)
          .setTint(pal.cloud)
          .setScale(0.7 + Math.random() * 0.6)
          .setDepth(-1.5)
          .setScrollFactor(0.45);
        this.skyLayers.push(c);
        this.driftClouds.push({ sprite: c, vx: 1.1 + Math.random() * 0.6, w: c.displayWidth });
      }
    }

    // Stars — denser on night-feel biomes.
    const starDim = biome === "lava" || biome === "desert" ? 0.2 : 0.9;
    const starCount = biome === "arctic" || biome === "dusk" ? 240 : 150;
    for (let i = 0; i < starCount; i++) {
      const x = rng.between(0, WORLD.WIDTH);
      const y = rng.between(0, skyH * 0.72);
      const alpha = rng.realInRange(0.1, 0.95) * starDim;
      const big = Math.random() < 0.08;
      const img = this.add
        .image(x, y, "pixel")
        .setAlpha(alpha)
        .setScale(big ? 2 : 1)
        .setTint(big ? 0xffe8c0 : 0xffffff)
        .setDepth(-3)
        .setScrollFactor(0.22);
      this.stars.add(img);
      if (big) {
        this.tweens.add({
          targets: img,
          alpha: alpha * 0.35,
          duration: 900 + Math.random() * 1400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    // Subtle atmospheric dust drifting upward across the map — sells
    // the sense of a living battlefield.
    const dust = this.add.particles(0, 0, "pixel", {
      lifespan: { min: 8000, max: 14000 },
      speedY: { min: -6, max: -2 },
      speedX: { min: -4, max: 4 },
      scale: { start: 0.8, end: 0.2 },
      tint: [pal.haze, pal.cloud],
      alpha: { start: 0.15, end: 0 },
      x: { min: 0, max: WORLD.WIDTH },
      y: { min: skyH * 0.5, max: WORLD.HEIGHT },
      quantity: 1,
      frequency: 450,
    });
    dust.setDepth(-0.8);
    dust.setScrollFactor(0.5);
    this.skyLayers.push(dust);
  }

  private setupInput(): void {
    // Drag to SET aim only. Firing is an explicit action (SPACE or FIRE button).
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function" && isTypingInForm()) {
        active.blur();
      }
      if (!this.canAct()) return;
      const isTouch =
        (pointer.event as PointerEvent | undefined)?.pointerType === "touch";
      if (this.targetingItem) {
        if (!isTouch && pointer.button === 2) {
          this.cancelTargeting();
          return;
        }
        if (!isTouch && pointer.button !== 0) return;
        this.commitTargetClick(pointer);
        return;
      }
      if (!isTouch && pointer.button !== 0) return;
      this.dragging = true;
      this.beginDrag(pointer);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.cursorOnCanvas = true;
      this.cursorScreenX = pointer.x;
      if (!this.dragging) return;
      this.updateAimFromPointer(pointer);
    });
    this.input.on("gameout", () => { this.cursorOnCanvas = false; });
    this.input.on("gameover", () => { this.cursorOnCanvas = true; });
    const endDrag = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.updateAimFromPointer(pointer);
      this.dragOverlay.clear();
    };
    this.input.on("pointerup", endDrag);
    this.input.on("pointerupoutside", endDrag);

    // Raw DOM listeners — these always respect document.activeElement and
    // never preventDefault, so typing into form inputs is untouched.
    this.domKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingInForm()) return;
      const k = e.key.toLowerCase();
      this.pressed.add(k);
      if (k === "escape" && this.targetingItem) {
        this.cancelTargeting();
        return;
      }
      if (k === " ") {
        this.tryFire();
      } else if (k >= "1" && k <= "9") {
        const idx = Number(k) - 1;
        if (idx < DEFAULT_LOADOUT.length && this.canAct()) {
          this.room.send("selectWeapon", { weapon: DEFAULT_LOADOUT[idx]! });
          Sound.play("ui_click");
        }
      } else if (k === "q" || k === "w" || k === "e" || k === "r") {
        const idx = ["q", "w", "e", "r"].indexOf(k);
        if (idx < DEFAULT_ITEMS.length && this.canAct()) {
          const id = DEFAULT_ITEMS[idx]!;
          if (TARGETED_ITEMS.has(id)) {
            this.beginTargeting(id);
          } else {
            this.room.send("useItem", { item: id });
            Sound.play("ui_click");
          }
        }
      }
    };
    this.domKeyUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.key.toLowerCase());
    };
    this.domTargetEvt = (e: Event) => {
      const detail = (e as CustomEvent<{ item: ItemId }>).detail;
      if (!detail) return;
      if (!this.canAct()) return;
      this.beginTargeting(detail.item);
    };
    window.addEventListener("keydown", this.domKeyDown);
    window.addEventListener("keyup", this.domKeyUp);
    window.addEventListener("artillery:target-item", this.domTargetEvt);
    // Right-click context menu would dismiss the targeting UX awkwardly.
    const onContextMenu = (e: MouseEvent) => {
      if (this.targetingItem) e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.domKeyDown);
      window.removeEventListener("keyup", this.domKeyUp);
      window.removeEventListener("artillery:target-item", this.domTargetEvt);
      window.removeEventListener("contextmenu", onContextMenu);
    });
  }

  private beginTargeting(id: ItemId): void {
    if (!this.canAct()) return;
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) return;
    const remaining = self.items.get(id) ?? 0;
    if (remaining <= 0) return;
    this.targetingItem = id;
    Sound.play("ui_click");
  }

  private cancelTargeting(): void {
    this.targetingItem = null;
    this.targetGfx?.clear();
  }

  private commitTargetClick(pointer: Phaser.Input.Pointer): void {
    const id = this.targetingItem;
    if (!id) return;
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) {
      this.cancelTargeting();
      return;
    }
    const range = id === "jetpack" ? ITEM_TUNING.jetpack.maxRange : 0;
    const dx = pointer.worldX - self.x;
    const dy = pointer.worldY - self.y;
    const dist = Math.hypot(dx, dy);
    let tx = pointer.worldX;
    let ty = pointer.worldY;
    if (range > 0 && dist > range) {
      const k = range / dist;
      tx = self.x + dx * k;
      ty = self.y + dy * k;
    }
    this.room.send("useItem", { item: id, targetX: tx, targetY: ty });
    Sound.play("ui_click");
    this.cancelTargeting();
  }

  private renderTargeting(): void {
    const g = this.targetGfx;
    if (!g) return;
    g.clear();
    const id = this.targetingItem;
    if (!id) return;
    if (!this.canAct()) {
      this.cancelTargeting();
      return;
    }
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) return;
    const range = id === "jetpack" ? ITEM_TUNING.jetpack.maxRange : 0;
    if (range > 0) {
      g.lineStyle(2, 0x7ed8ff, 0.7);
      g.strokeCircle(self.x, self.y, range);
      g.lineStyle(1, 0x7ed8ff, 0.25);
      g.strokeCircle(self.x, self.y, range * 0.66);
      g.strokeCircle(self.x, self.y, range * 0.33);
    }
    const ptr = this.input.activePointer;
    const dx = ptr.worldX - self.x;
    const dy = ptr.worldY - self.y;
    const dist = Math.hypot(dx, dy);
    let tx = ptr.worldX;
    let ty = ptr.worldY;
    if (range > 0 && dist > range) {
      const k = range / dist;
      tx = self.x + dx * k;
      ty = self.y + dy * k;
    }
    const inRange = range === 0 || dist <= range;
    const reticleColor = inRange ? 0x7ed8ff : 0xff5e5e;
    g.lineStyle(2, reticleColor, 0.95);
    g.strokeCircle(tx, ty, 14);
    g.beginPath();
    g.moveTo(tx - 22, ty); g.lineTo(tx - 6, ty);
    g.moveTo(tx + 6, ty); g.lineTo(tx + 22, ty);
    g.moveTo(tx, ty - 22); g.lineTo(tx, ty - 6);
    g.moveTo(tx, ty + 6); g.lineTo(tx, ty + 22);
    g.strokePath();
    g.lineStyle(1, reticleColor, 0.5);
    g.beginPath();
    g.moveTo(self.x, self.y); g.lineTo(tx, ty);
    g.strokePath();
  }

  private tryFire(): void {
    if (!this.canAct()) return;
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) return;
    if ((self.power ?? 0) < TANK.MIN_POWER) return;
    this.room.send("fire", {});
  }

  private isMyTurn(): boolean {
    return this.room.state.currentTurnId === this.room.sessionId;
  }

  /** True only while the player can still change aim, weapon, or fire —
   *  i.e. their turn, alive, no shot already in flight. */
  private canAct(): boolean {
    if (!this.isMyTurn()) return false;
    if (this.room.state.projectiles.size > 0) return false;
    const self = this.room.state.players.get(this.room.sessionId);
    return !!self && !self.dead;
  }

  private pollMoveKeys(): void {
    const typing = isTypingInForm();
    const self = this.room.state.players.get(this.room.sessionId);
    // Player is only allowed to roll when it's their turn, they're alive,
    // they have fuel, and the turn hasn't already been spent on a shot
    // (projectile in flight ≈ turnFired on the server).
    const canMove =
      this.isMyTurn() &&
      !typing &&
      !!self &&
      !self.dead &&
      self.fuel > 0 &&
      this.room.state.projectiles.size === 0;
    if (!canMove) {
      if (this.moveDir !== 0) {
        this.moveDir = 0;
        this.room.send("input", {
          left: false, right: false, up: false, down: false,
        });
        Sound.setTread(false);
      }
      return;
    }
    const left = this.pressed.has("a") || this.pressed.has("arrowleft");
    const right = this.pressed.has("d") || this.pressed.has("arrowright");
    const dir = left ? -1 : right ? 1 : 0;
    if (dir !== this.moveDir) {
      this.moveDir = dir;
      this.room.send("input", { left, right, up: false, down: false });
      // Don't play tread here — `updateTreadAudio` looks at whether the
      // server actually advanced our x. Keeps the hull silent while stuck
      // against a slope even though the key is held.
    }
  }

  /** Tread loop on/off based on whether the server has actually advanced
   *  the local tank in the last few hundred ms. Direction intent alone
   *  isn't enough — the server may be rejecting the step (slope cap, no
   *  fuel, turn-fired), and the loop would lie about movement. */
  private updateTreadAudio(timeMs: number): void {
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) {
      Sound.setTread(false);
      return;
    }
    if (Number.isNaN(this.lastSelfX)) this.lastSelfX = self.x;
    if (Math.abs(self.x - this.lastSelfX) > 0.05) {
      this.lastMoveAt = timeMs;
      this.lastSelfX = self.x;
    }
    const rollingRecently = timeMs - this.lastMoveAt < 160;
    Sound.setTread(this.moveDir !== 0 && rollingRecently && !self.dead);
  }

  /** Captures the cursor position and the tank's current aim tip so
   *  subsequent moves are treated as *deltas* applied to that anchor —
   *  dragging adjusts from the current aim rather than snapping the
   *  reticle to where you clicked. */
  private beginDrag(pointer: Phaser.Input.Pointer): void {
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) return;
    const worldPt = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    // Seed local state from the server-authoritative aim so the anchor
    // matches what the player currently sees.
    const baseAngle = self.angle ?? this.localAngleDeg;
    const basePower = Math.max(TANK.MIN_POWER, self.power || TANK.MIN_POWER);
    const facing: -1 | 1 = (self.facing as -1 | 1) || this.localFacing || 1;
    this.localAngleDeg = baseAngle;
    this.localPower = basePower;
    this.localFacing = facing;

    // Invert power→distance mapping: power = MIN + (MAX-MIN)*t^1.1,
    // so t = ((power-MIN)/(MAX-MIN))^(1/1.1), dist = t * MAX_DRAG_PX.
    const t = Math.pow(
      (basePower - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER),
      1 / 1.1,
    );
    const dist = Math.max(0, Math.min(1, t)) * MAX_DRAG_PX;
    const rad = (baseAngle * Math.PI) / 180;
    const tipX = self.x + Math.cos(rad) * facing * dist;
    const tipY = self.y - 6 + -Math.sin(rad) * dist;

    this.dragAnchorCursor = { x: worldPt.x, y: worldPt.y };
    this.dragAnchorTip = { x: tipX, y: tipY };
  }

  private updateAimFromPointer(pointer: Phaser.Input.Pointer): void {
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self) return;
    const worldPt = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    // Virtual tip = anchor tip + cursor delta. Lets the player nudge
    // from wherever the aim currently sits instead of snapping.
    const virtualX = this.dragAnchorTip.x + (worldPt.x - this.dragAnchorCursor.x);
    const virtualY = this.dragAnchorTip.y + (worldPt.y - this.dragAnchorCursor.y);
    const dx = virtualX - self.x;
    const dy = virtualY - (self.y - 6);
    const facing: -1 | 1 = dx >= 0 ? 1 : -1;
    const rawAngleDeg = (Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI;
    const angleDeg = Math.max(-90, Math.min(90, rawAngleDeg));
    const dist = Math.hypot(dx, dy);
    const t = Math.min(1, dist / MAX_DRAG_PX);
    const power =
      TANK.MIN_POWER + (TANK.MAX_POWER - TANK.MIN_POWER) * Math.pow(t, 1.1);

    this.localAngleDeg = angleDeg;
    this.localPower = power;
    this.localFacing = facing;

    const now = performance.now();
    if (now - this.lastAimSentAt > 33) {
      this.lastAimSentAt = now;
      this.room.send("aim", { angle: angleDeg, power, facing });
    }
  }

  private renderAim(): void {
    this.aimLine.clear();
    this.reticle.clear();
    this.dragOverlay.clear();
    if (!this.dragging) {
      if (this.aimLabel) this.aimLabel.setVisible(false);
      if (this.cursorPreview) this.cursorPreview.container.setVisible(false);
    }

    if (!this.isMyTurn()) return;
    const self = this.room.state.players.get(this.room.sessionId);
    if (!self || self.dead) return;

    const angleDeg = this.dragging ? this.localAngleDeg : self.angle;
    const facing = this.dragging ? this.localFacing : (self.facing as -1 | 1);
    const power = this.dragging
      ? this.localPower
      : Math.max(TANK.MIN_POWER, self.power || TANK.MIN_POWER);

    const angleRad = (angleDeg * Math.PI) / 180;
    const dirX = Math.cos(angleRad) * facing;
    const dirY = -Math.sin(angleRad);
    // Match the *rendered* barrel sprite pivot, not the server's
    // physics constant — those drift apart per hull/turret combo
    // because the texture pivot is computed from the rendered hull
    // canvas. Reading from TankView guarantees the arrow exits the
    // muzzle the player actually sees.
    const view = this.tanks.get(this.room.sessionId);
    const pivotX = view?.barrelOffsetX ?? TANK.BARREL_PIVOT_X;
    const pivotY = view?.barrelOffsetY ?? TANK.BARREL_PIVOT_Y;
    const barrelLen =
      TANK.BARREL_LENGTHS[self.barrelStyle] ?? TANK.BARREL_LENGTH;
    const baseX = self.x + pivotX * facing + dirX * barrelLen;
    const baseY = self.y + pivotY + dirY * barrelLen;

    const powerT =
      (power - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER);
    const dense = this.dragging;
    const perpX = -dirY;
    const perpY = dirX;

    if (!dense) {
      // Idle: thin tracer of the current aim. No extra chrome.
      const arrowLen = 40 + powerT * 90;
      const tipX = baseX + dirX * arrowLen;
      const tipY = baseY + dirY * arrowLen;
      this.aimLine.lineStyle(2, 0xd49228, 0.6);
      this.aimLine.beginPath();
      this.aimLine.moveTo(baseX, baseY);
      this.aimLine.lineTo(tipX, tipY);
      this.aimLine.strokePath();
      this.aimLine.fillStyle(0xd49228, 0.6);
      this.aimLine.fillTriangle(
        tipX + dirX * 8, tipY + dirY * 8,
        tipX - dirX * 3 + perpX * 5, tipY - dirY * 3 + perpY * 5,
        tipX - dirX * 3 - perpX * 5, tipY - dirY * 3 - perpY * 5,
      );
      return;
    }

    // Active drag: same scale as idle arrow, just thicker line and
    // power-coloured tier tint. Keeps geometry consistent so it never
    // jumps in size when drag begins.
    const arrowLen = 40 + powerT * 90;
    const tipX = baseX + dirX * arrowLen;
    const tipY = baseY + dirY * arrowLen;
    const tier =
      powerT > 0.9 ? 0xff5a3c :
      powerT > 0.65 ? 0xff8a2a :
      powerT > 0.35 ? 0xffbe52 : 0xf0e090;
    this.aimLine.lineStyle(3, tier, 0.95);
    this.aimLine.beginPath();
    this.aimLine.moveTo(baseX, baseY);
    this.aimLine.lineTo(tipX, tipY);
    this.aimLine.strokePath();
    this.aimLine.fillStyle(tier, 0.95);
    this.aimLine.fillTriangle(
      tipX + dirX * 8, tipY + dirY * 8,
      tipX - dirX * 3 + perpX * 5, tipY - dirY * 3 + perpY * 5,
      tipX - dirX * 3 - perpX * 5, tipY - dirY * 3 - perpY * 5,
    );

    // Cursor tank preview — a mini copy of the local player's tank
    // anchored at the pointer, with the barrel rotated to match the
    // current aim. Reuses the in-game hull/barrel textures so colours,
    // pattern, decal, and turret shape all match instantly.
    const ptr = this.input.activePointer;
    this.renderCursorPreview(self, ptr.x, ptr.y, angleDeg, facing, powerT, tier);
  }

  private renderCursorPreview(
    self: Player,
    cx: number,
    cy: number,
    angleDeg: number,
    facing: -1 | 1,
    powerT: number,
    tier: number,
  ): void {
    const SCALE = 0.7;
    const PREVIEW_OFFSET_Y = -12;

    const loadoutKey =
      `${self.bodyStyle}|${self.turretStyle}|${self.barrelStyle}|${self.color}|${self.accentColor}|${self.pattern}|${self.patternColor}|${self.decal}`;

    let p = this.cursorPreview;
    if (!p || p.loadoutKey !== loadoutKey) {
      // Tear down any stale preview (loadout changed mid-match).
      if (p) p.container.destroy(true);
      const meta = getTankPreviewTextures(this, self);
      const container = this.add.container(0, 0)
        .setDepth(16)
        .setScrollFactor(0);
      const hull = this.add.image(0, 0, meta.hull.textureKey)
        .setOrigin(
          meta.hull.hullCenterX / meta.hull.widthLogical,
          meta.hull.hullCenterY / meta.hull.heightLogical,
        )
        .setDisplaySize(meta.hull.widthLogical, meta.hull.heightLogical);
      const barrelOffsetX = meta.hull.barrelPivotX - meta.hull.hullCenterX;
      const barrelOffsetY = meta.hull.barrelPivotY - meta.hull.hullCenterY;
      const barrel = this.add.image(barrelOffsetX, barrelOffsetY, meta.barrel.textureKey)
        .setOrigin(
          meta.barrel.pivotX / meta.barrel.widthLogical,
          meta.barrel.pivotY / meta.barrel.heightLogical,
        )
        .setDisplaySize(meta.barrel.widthLogical, meta.barrel.heightLogical);
      container.add([hull, barrel]);
      p = { container, hull, barrel, barrelOffsetX, barrelOffsetY, loadoutKey };
      this.cursorPreview = p;
    }

    p.container.setVisible(true);
    p.container.setPosition(cx, cy + PREVIEW_OFFSET_Y);
    p.container.setScale(SCALE * facing, SCALE);
    const angleRad = (angleDeg * Math.PI) / 180;
    p.barrel.setRotation(-angleRad);

    // Power ring drawn around the preview — faint full circle plus a
    // bright arc filling clockwise as power climbs.
    const ringR = 32;
    this.dragOverlay.lineStyle(2, 0xffffff, 0.18);
    this.dragOverlay.strokeCircle(cx, cy + PREVIEW_OFFSET_Y, ringR);
    this.dragOverlay.lineStyle(3, tier, 0.9);
    this.dragOverlay.beginPath();
    this.dragOverlay.arc(
      cx, cy + PREVIEW_OFFSET_Y, ringR,
      -Math.PI / 2,
      -Math.PI / 2 + powerT * Math.PI * 2,
    );
    this.dragOverlay.strokePath();

    // Power % label below the ring — single readout, no overlap with
    // arrow since the arrow now lives at the tank.
    const txt = this.aimLabel ?? this.add
      .text(0, 0, "", {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "rgba(11,16,32,0.9)",
        padding: { left: 6, right: 6, top: 2, bottom: 2 },
      })
      .setDepth(17)
      .setScrollFactor(0)
      .setOrigin(0.5, 0);
    this.aimLabel = txt;
    txt.setText(`${Math.abs(angleDeg).toFixed(0)}°  ·  ${Math.round(powerT * 100)}%`);
    txt.setColor(`#${tier.toString(16).padStart(6, "0")}`);
    txt.setPosition(cx, cy + PREVIEW_OFFSET_Y + ringR + 6);
    txt.setVisible(true);
  }

  private updateCamera(dt: number): void {
    const target = this.pickCameraTarget();
    if (!target) return;
    const cam = this.cameras.main;
    const margin = 120;
    const ty = Phaser.Math.Clamp(
      target.y - 60,
      -300 + cam.height / 2,
      WORLD.HEIGHT - cam.height / 2 + margin,
    );
    const lerp = 1 - Math.pow(0.001, dt);
    cam.scrollY += (ty - cam.height / 2 - cam.scrollY) * lerp;

    const edgeDx = this.computeEdgeScrollDx(dt);
    if (edgeDx !== 0) {
      cam.scrollX = Phaser.Math.Clamp(
        cam.scrollX + edgeDx,
        0,
        Math.max(0, WORLD.WIDTH - cam.width),
      );
      return;
    }
    // Free-roam: during the local player's own turn (and no projectile in
    // flight) leave scrollX wherever the player parked it. Auto-follow
    // would yank the camera back to the tank as soon as the cursor left
    // the edge zone, which makes "look around" impossible.
    if (this.isMyTurn() && this.room.state.projectiles.size === 0) return;

    const tx = Phaser.Math.Clamp(
      target.x,
      cam.width / 2 - margin,
      WORLD.WIDTH - cam.width / 2 + margin,
    );
    cam.scrollX += (tx - cam.width / 2 - cam.scrollX) * lerp;
  }

  private computeEdgeScrollDx(dt: number): number {
    if (!this.isMyTurn()) return 0;
    if (this.dragging) return 0;
    if (!this.cursorOnCanvas) return 0;
    if (this.room.state.projectiles.size > 0) return 0;
    const cam = this.cameras.main;
    const EDGE = 80;
    const MAX_SPEED = 700;
    const x = this.cursorScreenX;
    if (x < EDGE) return -((EDGE - x) / EDGE) * MAX_SPEED * dt;
    if (x > cam.width - EDGE) {
      return ((x - (cam.width - EDGE)) / EDGE) * MAX_SPEED * dt;
    }
    return 0;
  }

  private pickCameraTarget(): { x: number; y: number } | null {
    if (this.room.state.projectiles.size > 0) {
      // Frame the *bounding box* of all live projectiles. For airstrike
      // (4 shells at the world ceiling falling toward impact) the box
      // spans ~700px vertically, and centering on its midpoint keeps
      // every shell in view. Single-projectile shots collapse to that
      // projectile's position.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      this.room.state.projectiles.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    const cur = this.room.state.players.get(this.room.state.currentTurnId);
    if (cur) return { x: cur.x, y: cur.y };
    const self = this.room.state.players.get(this.room.sessionId);
    return self ? { x: self.x, y: self.y } : null;
  }

  private wireRoom(): void {
    this.room.state.players.forEach((p, key) => this.addTank(p, key));
    this.room.state.projectiles.forEach((pr, key) => this.addProjectile(pr, key));
    this.room.state.fires.forEach((f, key) => this.addFire(f, key));

    const $ = getStateCallbacks(this.room);
    $(this.room.state).players.onAdd((p, key) => this.addTank(p, key));
    $(this.room.state).players.onRemove((_p, key) => this.removeTank(key));
    $(this.room.state).projectiles.onAdd((pr, key) => this.addProjectile(pr, key));
    $(this.room.state).projectiles.onRemove((_pr, key) => this.removeProjectile(key));
    $(this.room.state).fires.onAdd((f, key) => this.addFire(f, key));
    $(this.room.state).fires.onRemove((_f, key) => this.removeFire(key));
    $(this.room.state).terrain.heights.onChange(() =>
      this.terrainView.markDirty(),
    );

    let lastBiome = this.room.state.biome;
    this.room.onStateChange(() => {
      if (this.room.state.biome !== lastBiome) {
        lastBiome = this.room.state.biome;
        this.terrainView.setBiome((lastBiome as BiomeId) || "grasslands");
        this.drawStars((lastBiome as BiomeId) || "grasslands");
      }
    });

    this.game.events.on("server-event", (evt: ServerEvent) => this.handleEvent(evt));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("server-event");
      Sound.setWind(0);
    });
  }

  private addTank(p: Player, key: string): void {
    if (this.tanks.has(key)) return;
    this.tanks.set(key, new TankView(this, p));
  }
  private removeTank(key: string): void {
    const v = this.tanks.get(key);
    if (v) { v.destroy(); this.tanks.delete(key); }
  }
  private addProjectile(pr: Projectile, key: string): void {
    if (this.projectiles.has(key)) return;
    this.projectiles.set(key, new ProjectileView(this, pr));
    // Start recording our own arc the first time one of our projectiles
    // enters the world after a fire. Child projectiles (cluster bomblets,
    // MIRV warheads, airstrike fall-ins) spawn *after* the parent is
    // removed, so we also gate on `arcCapturedThisTurn` to make sure we
    // keep the primary arc and not a sub-munition's trail.
    if (
      this.trackedProjectileId === null &&
      !this.arcCapturedThisTurn &&
      pr.ownerId === this.room.sessionId
    ) {
      this.trackedProjectileId = pr.id;
      this.activeArc = [{ x: pr.x, y: pr.y }];
      // Snapshot where + how we fired so the previous-aim arrow can be
      // re-rendered as a reference.
      const self = this.room.state.players.get(this.room.sessionId);
      if (self) {
        this.lastShot = {
          tankX: self.x,
          tankY: self.y,
          angle: self.angle,
          power: Math.max(TANK.MIN_POWER, self.power || TANK.MIN_POWER),
          facing: (self.facing as -1 | 1) || 1,
        };
      }
    }
  }
  private removeProjectile(key: string): void {
    const v = this.projectiles.get(key);
    if (v) {
      if (v.state.id === this.trackedProjectileId) {
        // Snapshot the arc so subsequent turns can display it. Require a
        // minimum length so a projectile that explodes immediately on the
        // barrel doesn't paint a useless dot.
        if (this.activeArc.length >= 3) {
          this.lastArc = this.activeArc.slice();
        }
        this.trackedProjectileId = null;
        this.activeArc = [];
        this.arcCapturedThisTurn = true;
      }
      v.destroy();
      this.projectiles.delete(key);
    }
  }
  private addFire(f: FireTile, key: string): void {
    if (this.fires.has(key)) return;
    this.fires.set(key, new FireView(this, f));
  }
  private removeFire(key: string): void {
    const v = this.fires.get(key);
    if (v) { v.destroy(); this.fires.delete(key); }
  }

  private handleEvent(evt: ServerEvent): void {
    if (evt.type === "chat") {
      this.spawnSpeechBubble(evt.name, evt.text);
    } else if (evt.type === "fire") {
      const def = WEAPONS[evt.weapon];
      Sound.play(def.fireSfx, { rate: 0.8 + Math.random() * 0.3 });
      this.cameras.main.shake(80, 0.0025);
      this.spawnMuzzleFlash(evt.from.x, evt.from.y, def.tint);
    } else if (evt.type === "explosion") {
      const def = WEAPONS[evt.weapon];
      Sound.play(def.explodeSfx, { rate: 0.9 + Math.random() * 0.2 });
      this.spawnExplosion(evt.x, evt.y, evt.radius, def.tint);
      this.cameras.main.shake(180, 0.006);
    } else if (evt.type === "damage") {
      this.spawnDamageFloat(evt.x, evt.y, evt.amount);
    } else if (evt.type === "death") {
      Sound.play("death");
      const t = this.tanks.get(evt.tankId);
      if (t) {
        const em = this.add
          .particles(t.container.x, t.container.y, "spark", {
            lifespan: 700,
            speed: { min: 60, max: 180 },
            scale: { start: 1.1, end: 0 },
            tint: [0xffd25e, 0xff6b35, 0xe7ecf5],
            blendMode: Phaser.BlendModes.ADD,
            emitting: false,
          })
          .setDepth(8);
        em.explode(32, t.container.x, t.container.y);
        this.time.delayedCall(900, () => em.destroy());
      }
    } else if (evt.type === "turn") {
      this.lowTimePlayedForTurn = false;
      Sound.play("turn");
      if (evt.tankId === this.room.sessionId) {
        this.time.delayedCall(180, () => Sound.play("turn"));
        this.arcCapturedThisTurn = false;
        // Recenter on the local tank at turn start. Free-roam mode in
        // updateCamera() blocks the auto-follow while it's our turn, so
        // without this nudge the camera stays parked wherever the
        // previous turn ended.
        const me = this.room.state.players.get(this.room.sessionId);
        if (me) this.cameras.main.pan(me.x, me.y - 60, 350, "Sine.easeOut");
      }
    } else if (evt.type === "gameOver") {
      Sound.play(evt.winnerId ? "turn" : "thud");
    } else if (evt.type === "item") {
      if (evt.item === "jetpack" && evt.from) {
        const t = this.tanks.get(evt.tankId);
        if (t) t.playJetpack(evt.from, { x: evt.x, y: evt.y });
      }
    }
  }

  private spawnMuzzleFlash(x: number, y: number, tint: number): void {
    const em = this.add
      .particles(x, y, "spark", {
        lifespan: 260,
        speed: { min: 60, max: 240 },
        scale: { start: 0.8, end: 0 },
        tint: [tint, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(8);
    em.explode(14, x, y);
    this.time.delayedCall(400, () => em.destroy());
  }

  private spawnDamageFloat(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y - 10, `-${Math.round(amount)}`, {
        fontFamily: "Orbitron, system-ui",
        fontStyle: "900",
        fontSize: "16px",
        color: amount >= 40 ? "#ff5e7a" : "#ffd25e",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(14);
    this.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  /** Floating comic-style speech bubble over the tank of whoever sent
   *  `text` in chat. Finds the player by name (server broadcasts name,
   *  not id). Falls back to silently dropping if no matching tank is
   *  on screen — system messages, disconnected players, etc. */
  private spawnSpeechBubble(name: string, text: string): void {
    if (!text || name === "server") return;
    // Find the player by display name.
    let ownerId: string | null = null;
    this.room.state.players.forEach((p, id) => {
      if (ownerId === null && p.name === name) ownerId = id;
    });
    if (!ownerId) return;
    const view = this.tanks.get(ownerId);
    if (!view) return;

    // Cap very long messages so bubbles don't cover the battlefield.
    const display = text.length > 60 ? text.slice(0, 58) + "…" : text;

    // Remove any existing bubble for this player — new message replaces it.
    const existing = this.speechBubbles.get(ownerId);
    if (existing) existing.container.destroy();

    const container = this.add.container(view.container.x, view.container.y - 50);
    container.setDepth(20);
    const label = this.add.text(0, 0, display, {
      fontFamily: "Chakra Petch, system-ui",
      fontSize: "12px",
      color: "#f0ead8",
      fontStyle: "600",
      align: "center",
      wordWrap: { width: 220 },
    }).setOrigin(0.5, 0.5);
    const pad = { x: 10, y: 6 };
    const bounds = label.getBounds();
    const bgW = Math.max(60, bounds.width + pad.x * 2);
    const bgH = bounds.height + pad.y * 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x0b0c10, 0.92);
    bg.lineStyle(1.2, 0xd0a878, 0.8);
    bg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 5);
    bg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 5);
    // Tail pointing down at the tank.
    bg.fillStyle(0x0b0c10, 0.92);
    bg.lineStyle(1.2, 0xd0a878, 0.8);
    bg.beginPath();
    bg.moveTo(-6, bgH / 2);
    bg.lineTo(0, bgH / 2 + 7);
    bg.lineTo(6, bgH / 2);
    bg.closePath();
    bg.fillPath();
    bg.strokePath();
    // Hide the top edge of the tail seam.
    bg.fillStyle(0x0b0c10, 1);
    bg.fillRect(-5, bgH / 2 - 0.5, 10, 1);

    container.add(bg);
    container.add(label);

    // Drop-in tween.
    container.setScale(0.4);
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
    });

    // Lingering display time scales with length so short barks fade
    // fast and longer messages stick around.
    const displayMs = Math.max(3800, Math.min(6500, 3400 + display.length * 55));
    this.speechBubbles.set(ownerId, {
      container,
      ownerId,
      expireAt: this.time.now + displayMs,
    });
  }

  /** Track + fade speech bubbles. Called from `update`. */
  private updateSpeechBubbles(timeMs: number): void {
    for (const [id, bubble] of this.speechBubbles) {
      const view = this.tanks.get(id);
      if (!view) {
        bubble.container.destroy();
        this.speechBubbles.delete(id);
        continue;
      }
      bubble.container.setPosition(view.container.x, view.container.y - 50);
      const remaining = bubble.expireAt - timeMs;
      if (remaining <= 0) {
        this.tweens.add({
          targets: bubble.container,
          alpha: 0,
          scale: 0.8,
          duration: 220,
          onComplete: () => bubble.container.destroy(),
        });
        this.speechBubbles.delete(id);
      } else if (remaining < 400) {
        bubble.container.setAlpha(remaining / 400);
      }
    }
  }

  private spawnExplosion(x: number, y: number, radius: number, tint: number): void {
    // 1) Pre-flash — sharp bright white disc that blinks for a single
    //    frame so the detonation reads with weight.
    const preflash = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffffff)
      .setDisplaySize(radius * 3.1, radius * 3.1)
      .setDepth(9);
    this.tweens.add({
      targets: preflash,
      alpha: 0,
      scale: preflash.scale * 1.8,
      duration: 90,
      ease: "Quad.easeOut",
      onComplete: () => preflash.destroy(),
    });

    // 2) Main fireball — warm orange layer.
    const fireball = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc458)
      .setDisplaySize(radius * 0.6, radius * 0.6)
      .setDepth(8);
    this.tweens.add({
      targets: fireball,
      displayWidth: radius * 2.6,
      displayHeight: radius * 2.6,
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => fireball.destroy(),
    });

    // 3) Inner hot core — saturated yellow on top for intensity.
    const core = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff2b0)
      .setDisplaySize(radius * 0.4, radius * 0.4)
      .setDepth(9);
    this.tweens.add({
      targets: core,
      displayWidth: radius * 1.3,
      displayHeight: radius * 1.3,
      alpha: 0,
      duration: 280,
      ease: "Cubic.easeOut",
      onComplete: () => core.destroy(),
    });

    // 4) Weapon-tint tone layer — subtle hue wash based on the weapon.
    const toneTint = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setDisplaySize(radius * 0.9, radius * 0.9)
      .setAlpha(0.75)
      .setDepth(8);
    this.tweens.add({
      targets: toneTint,
      displayWidth: radius * 2.8,
      displayHeight: radius * 2.8,
      alpha: 0,
      duration: 600,
      ease: "Quad.easeOut",
      onComplete: () => toneTint.destroy(),
    });

    // 5) Two shockwave rings — outer white sonic + inner tint ring
    //    travelling at slightly different speeds for a proper "boom".
    const ring = this.add.graphics().setDepth(8);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 560,
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: { r: radius * 0.25 },
      r: radius * 1.95,
      duration: 540,
      ease: "Cubic.easeOut",
      onUpdate: (tw) => {
        const r = (tw.getValue() ?? radius) as number;
        ring.clear();
        ring.lineStyle(3.5, 0xffe6c4, ring.alpha);
        ring.strokeCircle(x, y, r);
        ring.lineStyle(1.6, tint, ring.alpha * 0.75);
        ring.strokeCircle(x, y, r * 0.82);
        // Faint dust ring trailing behind.
        ring.lineStyle(1.2, 0x8a6a3a, ring.alpha * 0.55);
        ring.strokeCircle(x, y, r * 1.15);
      },
    });

    // 6) Ground-slam dust halo — brief wide flat disc along the ground.
    const dustHalo = this.add
      .image(x, y + 2, "smoke")
      .setTint(0x6a4e2a)
      .setAlpha(0.6)
      .setDisplaySize(radius * 0.8, radius * 0.3)
      .setDepth(7);
    this.tweens.add({
      targets: dustHalo,
      displayWidth: radius * 3.4,
      displayHeight: radius * 0.9,
      alpha: 0,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => dustHalo.destroy(),
    });

    // Particle emitters are all created at world origin (0, 0) so the
    // `explode(count, x, y)` call sets the spawn point unambiguously in
    // world coords. Creating an emitter at (x, y) *and* then calling
    // explode(count, x, y) can double-apply positions under some Phaser
    // versions — this pattern avoids that class of bug entirely.

    // 7) Hot spark burst — more sparks, further range.
    const sparks = this.add
      .particles(0, 0, "spark", {
        lifespan: { min: 550, max: 950 },
        speed: { min: 150, max: 440 },
        scale: { start: 1.8, end: 0 },
        tint: [tint, 0xffffff, 0xffb24a, 0xff5a2a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9);
    sparks.explode(50 + Math.floor(radius / 5), x, y);

    // 8) Glowing embers — slower, lingering sparks that tumble through
    //    gravity so the aftermath reads like a real blast.
    const embers = this.add
      .particles(0, 0, "spark", {
        lifespan: { min: 1200, max: 2000 },
        speed: { min: 60, max: 220 },
        angle: { min: 230, max: 310 },
        gravityY: 360,
        scale: { start: 0.9, end: 0 },
        tint: [0xffb24a, 0xff7030, 0xc03418],
        blendMode: Phaser.BlendModes.ADD,
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(8);
    embers.explode(Math.round(20 + radius / 6), x, y);

    // 9) Dirt/rock debris tumbling from the crater.
    const debris = this.add
      .particles(0, 0, "debris_chunk", {
        lifespan: { min: 900, max: 1800 },
        speed: { min: 180, max: 420 },
        angle: { min: 210, max: 330 },
        gravityY: 1100,
        scale: { start: 1.15, end: 0.55 },
        rotate: { start: 0, end: 540 },
        tint: [0x5a3b1f, 0x3a2513, 0x2a1608, 0x7a5532],
        emitting: false,
      })
      .setDepth(6);
    debris.explode(Math.round(radius / 3.2), x, y - 6);

    // 10) Rising smoke pillar — taller, more volumes, drifts sideways.
    const smoke = this.add
      .particles(0, 0, "smoke", {
        lifespan: { min: 1600, max: 2400 },
        speedX: { min: -60, max: 60 },
        speedY: { min: -160, max: -70 },
        scale: { start: 0.85, end: 3.4 },
        tint: [0x3a3a3a, 0x22201c, 0x4a3a28, 0x6a5238],
        alpha: { start: 0.9, end: 0 },
        emitting: false,
      })
      .setDepth(5);
    smoke.explode(Math.round(30 + radius / 7), x, y - 4);

    // 11) Low-lying dust cloud that settles slowly, biome-ground-toned.
    const dust = this.add
      .particles(0, 0, "smoke", {
        lifespan: { min: 900, max: 1500 },
        speedX: { min: -130, max: 130 },
        speedY: { min: -20, max: 10 },
        scale: { start: 0.6, end: 2.2 },
        tint: [0x8a6a3a, 0x6a4a20, 0x9a7a4a],
        alpha: { start: 0.5, end: 0 },
        emitting: false,
      })
      .setDepth(5);
    dust.explode(Math.round(radius / 6), x, y - 2);

    this.time.delayedCall(2500, () => {
      sparks.destroy(); smoke.destroy(); debris.destroy();
      embers.destroy(); dust.destroy();
    });
  }
}

