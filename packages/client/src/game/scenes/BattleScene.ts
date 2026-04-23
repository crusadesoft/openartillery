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
  type WeaponId,
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

  private stars!: Phaser.GameObjects.Group;
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
    // Dotted segments sampled every ~22 world px.
    this.lastArcGfx.fillStyle(0xd49228, 0.55);
    let acc = 0;
    for (let i = 1; i < this.lastArc.length; i++) {
      const a = this.lastArc[i - 1]!;
      const b = this.lastArc[i]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      acc += segLen;
      if (acc >= 22) {
        acc = 0;
        this.lastArcGfx.fillCircle(b.x, b.y, 1.7);
      }
    }
    // Emphasised landing pin.
    const last = this.lastArc[this.lastArc.length - 1]!;
    this.lastArcGfx.lineStyle(1.5, 0xd49228, 0.75);
    this.lastArcGfx.strokeCircle(last.x, last.y, 5);
    this.lastArcGfx.fillStyle(0xd49228, 0.9);
    this.lastArcGfx.fillCircle(last.x, last.y, 1.6);
  }

  private drawStars(biome: BiomeId): void {
    this.stars?.clear(true, true);
    this.stars = this.add.group();
    const dim = biome === "lava" || biome === "desert" ? 0.35 : 0.85;
    const rng = Phaser.Math.RND;
    for (let i = 0; i < 120; i++) {
      const x = rng.between(0, WORLD.WIDTH);
      const y = rng.between(0, WORLD.HEIGHT * 0.5);
      const alpha = rng.realInRange(0.15, 0.9) * dim;
      const img = this.add
        .image(x, y, "pixel")
        .setAlpha(alpha)
        .setDepth(-1)
        .setScrollFactor(0.3);
      this.stars.add(img);
    }
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
    if (evt.type === "fire") {
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

  private spawnExplosion(x: number, y: number, radius: number, tint: number): void {
    // 1) Instant white flash — briefly washes out the area so the hit reads.
    const flash = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffffff)
      .setDisplaySize(radius * 2.4, radius * 2.4)
      .setDepth(8);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: flash.scale * 1.4,
      duration: 130,
      onComplete: () => flash.destroy(),
    });

    // 2) Expanding fireball (orange/yellow disc that fades to smoke).
    const fireball = this.add
      .image(x, y, "smoke")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffb24a)
      .setDisplaySize(radius * 0.6, radius * 0.6)
      .setDepth(7);
    this.tweens.add({
      targets: fireball,
      displayWidth: radius * 2.2,
      displayHeight: radius * 2.2,
      alpha: 0,
      duration: 380,
      ease: "Cubic.easeOut",
      onComplete: () => fireball.destroy(),
    });

    // 3) Shockwave ring (expanding white circle outline).
    const ring = this.add.graphics().setDepth(7);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: { r: radius * 0.3 },
      r: radius * 1.6,
      duration: 400,
      onUpdate: (tw) => {
        const r = tw.getValue() ?? radius;
        ring.clear();
        ring.lineStyle(3, 0xffe6c4, ring.alpha);
        ring.strokeCircle(x, y, r);
        ring.lineStyle(1.5, tint, ring.alpha * 0.7);
        ring.strokeCircle(x, y, r * 0.85);
      },
    });

    // 4) Hot spark burst.
    const sparks = this.add
      .particles(x, y, "spark", {
        lifespan: 700,
        speed: { min: 120, max: 340 },
        scale: { start: 1.6, end: 0 },
        tint: [tint, 0xffffff, 0xffb24a, 0xff5a2a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(8);
    sparks.explode(34 + Math.floor(radius / 8), x, y);

    // 5) Dirt/rock debris tumbling from the crater.
    const debris = this.add
      .particles(x, y - 6, "debris_chunk", {
        lifespan: { min: 700, max: 1400 },
        speed: { min: 160, max: 360 },
        angle: { min: 210, max: 330 },
        gravityY: 900,
        scale: { start: 1.0, end: 0.6 },
        rotate: { start: 0, end: 360 },
        tint: [0x5a3b1f, 0x3a2513, 0x2a1608],
        emitting: false,
      })
      .setDepth(6);
    debris.explode(Math.round(radius / 4), x, y - 6);

    // 6) Rising smoke pillar.
    const smoke = this.add
      .particles(x, y - 4, "smoke", {
        lifespan: 1200,
        speedX: { min: -30, max: 30 },
        speedY: { min: -120, max: -60 },
        scale: { start: 0.9, end: 2.6 },
        tint: [0x3a3a3a, 0x22201c, 0x4a3a28],
        alpha: { start: 0.85, end: 0 },
        emitting: false,
      })
      .setDepth(5);
    smoke.explode(22, x, y - 4);

    this.time.delayedCall(1600, () => {
      sparks.destroy(); smoke.destroy(); debris.destroy();
    });
  }
}
