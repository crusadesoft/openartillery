import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import {
  BattleState,
  type BiomeId,
  DEFAULT_LOADOUT,
  FireTile,
  Player,
  Projectile,
  ServerEvent,
  TANK,
  WORLD,
  WEAPONS,
} from "@artillery/shared";
import { Sound } from "../audio/Sound";
import { TankView } from "../entities/Tank";
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
  private aimLine!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private dragOverlay!: Phaser.GameObjects.Graphics;
  private lastArcGfx!: Phaser.GameObjects.Graphics;

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

  constructor() {
    super({ key: "battle" });
  }

  create(): void {
    this.room = this.game.registry.get("room") as Room<BattleState>;
    Sound.init();

    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.matter.world.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const biome = (this.room.state.biome as BiomeId) || "grasslands";
    this.terrainView = new TerrainView(this, this.room.state.terrain, biome);

    this.drawStars(biome);
    this.lastArcGfx = this.add.graphics().setDepth(11);
    this.aimLine = this.add.graphics().setDepth(12);
    this.reticle = this.add.graphics().setDepth(13);
    this.dragOverlay = this.add.graphics().setDepth(14).setScrollFactor(0);

    this.setupInput();
    this.wireRoom();

    this.cameras.main.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
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
    this.room.state.fires.forEach((f) => {
      const view = this.fires.get(f.id);
      if (view) view.sync(f);
    });
    this.recordActiveArc();

    this.renderLastArc();
    this.renderAim();
    this.updateCamera(dt);
    this.updateSpeechBubbles(time);
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
    // Same off-white palette as the trace so it reads as one reference.
    if (this.lastShot) {
      const { tankX, tankY, angle, power, facing } = this.lastShot;
      const barrelLen =
        TANK.BARREL_LENGTHS[self.barrelStyle] ?? TANK.BARREL_LENGTH;
      const angleRad = (angle * Math.PI) / 180;
      const dirX = Math.cos(angleRad) * facing;
      const dirY = -Math.sin(angleRad);
      const baseX = tankX + TANK.BARREL_PIVOT_X * facing + dirX * barrelLen;
      const baseY = tankY + TANK.BARREL_PIVOT_Y + dirY * barrelLen;
      const powerT = Math.max(
        0,
        Math.min(1, (power - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER)),
      );
      const arrowLen = 40 + powerT * 90;
      const tipX = baseX + dirX * arrowLen;
      const tipY = baseY + dirY * arrowLen;
      this.lastArcGfx.lineStyle(2, color, 0.6);
      this.lastArcGfx.lineBetween(baseX, baseY, tipX, tipY);
      // Arrowhead — triangle at the tip.
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

    // Drifting clouds — sit between the far and near mountain layers so
    // they read as mid-distance and respect parallax. None on lava
    // (replaced with falling embers via TerrainView).
    const rng = Phaser.Math.RND;
    if (biome !== "lava") {
      const n = biome === "desert" ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const key = i % 2 === 0 ? "cloud_a" : "cloud_b";
        const cx = rng.between(0, WORLD.WIDTH);
        const cy = rng.between(skyH * 0.2, skyH * 0.55);
        const c = this.add
          .image(cx, cy, key)
          .setAlpha(0.45 + Math.random() * 0.35)
          .setTint(pal.cloud)
          .setScale(0.8 + Math.random() * 0.7)
          .setDepth(-1.5)
          .setScrollFactor(0.45);
        this.skyLayers.push(c);
        this.tweens.add({
          targets: c,
          x: cx + (Math.random() * 240 - 120),
          duration: 30000 + Math.random() * 40000,
          yoyo: true,
          repeat: -1,
        });
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
      if (!isTouch && pointer.button !== 0) return;
      this.dragging = true;
      this.beginDrag(pointer);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.updateAimFromPointer(pointer);
    });
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
      if (k === " " || e.key === "Enter") {
        this.tryFire();
      } else if (k >= "1" && k <= "9") {
        const idx = Number(k) - 1;
        if (idx < DEFAULT_LOADOUT.length && this.canAct()) {
          this.room.send("selectWeapon", { weapon: DEFAULT_LOADOUT[idx]! });
          Sound.play("ui_click");
        }
      }
    };
    this.domKeyUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", this.domKeyDown);
    window.addEventListener("keyup", this.domKeyUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.domKeyDown);
      window.removeEventListener("keyup", this.domKeyUp);
    });
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
    // Match the barrel sprite pivot so the arrow emerges from the muzzle,
    // not the hull center. Must stay in sync with World.barrelTip().
    // Use the player's actual barrel length so the aim arrow starts
    // exactly at the muzzle tip instead of always using the standard
    // length — otherwise sniper/long/stubby draw arrows inside or past
    // their own barrel.
    const barrelLen =
      TANK.BARREL_LENGTHS[self.barrelStyle] ?? TANK.BARREL_LENGTH;
    const baseX = self.x + TANK.BARREL_PIVOT_X * facing + dirX * barrelLen;
    const baseY = self.y + TANK.BARREL_PIVOT_Y + dirY * barrelLen;

    // Short directional indicator only — no ballistic "cheat" preview.
    // Length scales with power so the player gets feel for how much they
    // charged, but no full-arc + impact circle.
    const powerT =
      (power - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER);
    const arrowLen = 40 + powerT * 90;
    const tipX = baseX + dirX * arrowLen;
    const tipY = baseY + dirY * arrowLen;
    const dense = this.dragging;

    this.aimLine.lineStyle(
      dense ? 3 : 2,
      dense ? 0xffbe52 : 0xd49228,
      dense ? 0.95 : 0.6,
    );
    this.aimLine.beginPath();
    this.aimLine.moveTo(baseX, baseY);
    this.aimLine.lineTo(tipX, tipY);
    this.aimLine.strokePath();

    // Small arrowhead on the tip.
    const perpX = -dirY;
    const perpY = dirX;
    this.aimLine.fillStyle(dense ? 0xffbe52 : 0xd49228, dense ? 0.95 : 0.6);
    this.aimLine.fillTriangle(
      tipX + dirX * 8, tipY + dirY * 8,
      tipX - dirX * 3 + perpX * 5, tipY - dirY * 3 + perpY * 5,
      tipX - dirX * 3 - perpX * 5, tipY - dirY * 3 - perpY * 5,
    );

    if (dense) {
      const cam = this.cameras.main;
      const sx = baseX - cam.scrollX;
      const sy = baseY - cam.scrollY;
      const barLen = 88;
      this.dragOverlay.fillStyle(0x0b1020, 0.8);
      this.dragOverlay.fillRect(sx - barLen / 2 - 2, sy - 28, barLen + 4, 10);
      this.dragOverlay.fillStyle(
        powerT > 0.9 ? 0xc03a3a : powerT > 0.6 ? 0xd49228 : 0xffbe52,
        1,
      );
      this.dragOverlay.fillRect(
        sx - barLen / 2,
        sy - 26,
        barLen * powerT,
        6,
      );
    }
  }

  private updateCamera(dt: number): void {
    const target = this.pickCameraTarget();
    if (!target) return;
    const cam = this.cameras.main;
    const margin = 120;
    const tx = Phaser.Math.Clamp(
      target.x,
      cam.width / 2 - margin,
      WORLD.WIDTH - cam.width / 2 + margin,
    );
    const ty = Phaser.Math.Clamp(
      target.y - 60,
      cam.height / 2 - margin,
      WORLD.HEIGHT - cam.height / 2 + margin,
    );
    const lerp = 1 - Math.pow(0.001, dt);
    cam.scrollX += (tx - cam.width / 2 - cam.scrollX) * lerp;
    cam.scrollY += (ty - cam.height / 2 - cam.scrollY) * lerp;
  }

  private pickCameraTarget(): { x: number; y: number } | null {
    const proj = this.room.state.projectiles.values().next().value as
      | Projectile
      | undefined;
    if (proj) return { x: proj.x, y: proj.y };
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
      Sound.play("turn");
      // A new turn starts fresh: re-enable arc tracking so the next shot
      // we take overwrites the previously-displayed arc.
      if (evt.tankId === this.room.sessionId) {
        this.arcCapturedThisTurn = false;
      }
    } else if (evt.type === "gameOver") {
      Sound.play(evt.winnerId ? "turn" : "thud");
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
    const displayMs = Math.max(1800, Math.min(4500, 1400 + display.length * 55));
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

