import Phaser from "phaser";
import type { Player } from "@artillery/shared";
import { TANK } from "@artillery/shared";
import {
  HULL_WIDTHS,
  renderBarrelCanvas,
  renderHullCanvas,
  type BarrelStyle,
  type BodyStyle,
  type DecalStyle,
  type HullRenderResult,
  type PatternStyle,
  type TurretStyle,
  type BarrelRenderResult,
} from "../tankPreview";

interface RexUI {
  add: {
    label: (cfg: Record<string, unknown>) => Phaser.GameObjects.GameObject & {
      layout: () => Phaser.GameObjects.GameObject;
      setPosition: (x: number, y: number) => unknown;
      destroy: () => void;
    };
    roundRectangle: (
      x: number, y: number, w: number, h: number, r: number,
      color: number, alpha?: number,
    ) => Phaser.GameObjects.GameObject;
  };
}
type RexScene = Phaser.Scene & { rexUI: RexUI };

/**
 * Visual representation of a Player. Every tank is rendered using the
 * same drawing code (`tankPreview.renderHullCanvas` / `renderBarrelCanvas`)
 * that the Customize / Arsenal / Leaderboard / Profile screens use —
 * single source of truth. Body + turret + pattern + decal + accent
 * stripe are baked into one per-player canvas texture; the barrel is a
 * separate texture so it can rotate for aim. No Phaser tinting of the
 * hull (colour is already baked in); only the `dead` state applies a
 * darkening tint on top.
 */
export class TankView {
  readonly container: Phaser.GameObjects.Container;
  private hull: Phaser.GameObjects.Image;
  private barrel: Phaser.GameObjects.Image;
  /** Offset from container origin (tank centre) to the barrel pivot
   *  in the +facing orientation. Negated in x for -facing. */
  barrelOffsetX = 0;
  barrelOffsetY = 0;
  private label: ReturnType<RexUI["add"]["label"]>;
  private hpBar: Phaser.GameObjects.Graphics;
  private turnRing: Phaser.GameObjects.Graphics;
  private lastHp: number = TANK.MAX_HP;
  private fireEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, public player: Player) {
    const c = scene.add.container(player.x, player.y);
    c.setDepth(10);
    this.container = c;

    this.turnRing = scene.add.graphics();
    this.turnRing.lineStyle(2, 0xffbe52, 0.7);
    this.turnRing.strokeCircle(0, 0, 30);
    this.turnRing.lineStyle(1, 0xffbe52, 0.35);
    this.turnRing.strokeCircle(0, 0, 36);
    this.turnRing.setVisible(false);
    c.add(this.turnRing);

    // Build / reuse the per-player hull texture. The key fingerprints
    // every loadout field so two players with identical loadouts share
    // a single GPU texture.
    const hullMeta = ensureHullTexture(scene, player);
    const barrelMeta = ensureBarrelTexture(
      scene,
      (player.barrelStyle || "standard") as BarrelStyle,
    );

    // Hull sprite — origin anchored at the hull centre so (0, 0) in the
    // container corresponds to the tank's physics centre.
    this.hull = scene.add.image(0, 0, hullMeta.textureKey);
    this.hull.setOrigin(
      hullMeta.hullCenterX / hullMeta.widthLogical,
      hullMeta.hullCenterY / hullMeta.heightLogical,
    );
    this.hull.setDisplaySize(hullMeta.widthLogical, hullMeta.heightLogical);
    c.add(this.hull);

    // Barrel sprite — origin at the breech end. Positioned at the
    // hull's barrel pivot offset (relative to hull centre).
    this.barrelOffsetX = hullMeta.barrelPivotX - hullMeta.hullCenterX;
    this.barrelOffsetY = hullMeta.barrelPivotY - hullMeta.hullCenterY;
    this.barrel = scene.add.image(
      this.barrelOffsetX,
      this.barrelOffsetY,
      barrelMeta.textureKey,
    );
    this.barrel.setOrigin(
      barrelMeta.pivotX / barrelMeta.widthLogical,
      barrelMeta.pivotY / barrelMeta.heightLogical,
    );
    this.barrel.setDisplaySize(barrelMeta.widthLogical, barrelMeta.heightLogical);
    c.add(this.barrel);

    const rex = (scene as RexScene).rexUI;
    this.label = rex.add
      .label({
        orientation: "horizontal",
        background: rex.add.roundRectangle(0, 0, 10, 10, 2, 0x0a0c14, 0.75),
        text: scene.add.text(0, 0, player.name, {
          fontFamily: "Chakra Petch, system-ui",
          fontSize: "11px",
          color: "#e8ecfa",
          fontStyle: "600",
        }),
        space: { left: 6, right: 6, top: 2, bottom: 2 },
      })
      .layout() as unknown as ReturnType<RexUI["add"]["label"]>;
    (this.label as unknown as { setDepth(d: number): void }).setDepth(11);

    this.hpBar = scene.add.graphics();
    c.add(this.hpBar);
    this.drawHpBar(player.hp);
  }

  sync(player: Player, isCurrentTurn: boolean, slopeDeg = 0): void {
    this.player = player;
    this.container.setPosition(player.x, player.y);
    this.container.setAlpha(player.dead ? 0.6 : 1);
    this.container.setRotation(
      ((slopeDeg + (player.dead ? 14 : 0)) * Math.PI) / 180,
    );

    const angleRad = (player.angle * Math.PI) / 180;

    // Facing is handled by mirroring both hull and barrel horizontally.
    // Using `scaleX = -1` (rather than `setFlipX`) mirrors around the
    // sprite's origin anchor, which is what we want for consistent
    // pivot-based rotation. Because Phaser applies scale *before*
    // rotation, flipping x inverts the direction the rotation swings
    // — so the barrel's rotation angle must flip sign with facing to
    // keep pointing at the same world-space target.
    const facing = player.facing < 0 ? -1 : 1;
    this.hull.scaleX = facing * Math.abs(this.hull.scaleX);
    this.barrel.scaleX = facing * Math.abs(this.barrel.scaleX);
    this.barrel.setPosition(this.barrelOffsetX * facing, this.barrelOffsetY);
    this.barrel.setRotation(-angleRad * facing);

    // Dead state darkens the hull via a multiply-tint on top of the
    // pre-coloured texture. Live hulls use 0xffffff which leaves the
    // baked colour alone.
    const deadTint = 0x5a3018;
    this.hull.setTint(player.dead ? deadTint : 0xffffff);
    this.barrel.setTint(player.dead ? 0x2a1818 : 0xffffff);

    this.turnRing.setVisible(isCurrentTurn && !player.dead);
    this.label.setPosition(player.x, player.y - 34);
    (this.label as unknown as { setAlpha: (a: number) => void }).setAlpha(
      player.dead ? 0.4 : 1,
    );
    if (this.lastHp !== player.hp) {
      this.drawHpBar(player.hp);
      this.lastHp = player.hp;
    }
    if (player.dead && !this.fireEmitter) {
      this.spawnWreckFire();
    }
    if (this.fireEmitter) {
      this.fireEmitter.setPosition(player.x, player.y - 4);
      this.smokeEmitter?.setPosition(player.x, player.y - 12);
    }
  }

  private spawnWreckFire(): void {
    const p = this.player;
    this.fireEmitter = this.scene.add
      .particles(p.x, p.y - 4, "spark", {
        lifespan: 700,
        speedY: { min: -140, max: -80 },
        speedX: { min: -30, max: 30 },
        scale: { start: 1, end: 0 },
        tint: [0xffd25e, 0xff8428, 0xff3a18],
        blendMode: Phaser.BlendModes.ADD,
        quantity: 2,
        frequency: 50,
      })
      .setDepth(9);
    this.smokeEmitter = this.scene.add
      .particles(p.x, p.y - 12, "smoke", {
        lifespan: 1600,
        speedY: { min: -60, max: -30 },
        speedX: { min: -15, max: 15 },
        scale: { start: 0.4, end: 1.4 },
        tint: [0x2a2a2a, 0x1a1a1a],
        alpha: { start: 0.65, end: 0 },
        quantity: 1,
        frequency: 130,
      })
      .setDepth(8);
  }

  private drawHpBar(hp: number): void {
    const w = 42;
    const h = 4;
    const x = -w / 2;
    const y = -22;
    const frac = Math.max(0, Math.min(1, hp / TANK.MAX_HP));
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.hpBar.fillStyle(0x201a12, 1);
    this.hpBar.fillRect(x, y, w, h);
    const color = frac > 0.5 ? 0x85a158 : frac > 0.25 ? 0xd49228 : 0xc03a3a;
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRect(x, y, w * frac, h);
    this.hpBar.fillStyle(0x000000, 0.55);
    for (let i = 1; i < 4; i++) this.hpBar.fillRect(x + (w / 4) * i, y, 1, h);
  }

  destroy(): void {
    this.container.destroy(true);
    this.label.destroy();
  }
}

/** Used by the cursor-preview overlay to mount a copy of the local
 *  player's hull + barrel sprites without duplicating the texture
 *  generation. Returns the cached texture metadata; the texture itself
 *  was already added to the scene by TankView's constructor. */
export function getTankPreviewTextures(
  scene: Phaser.Scene,
  p: Player,
): { hull: HullMeta; barrel: BarrelMeta } {
  return {
    hull: ensureHullTexture(scene, p),
    barrel: ensureBarrelTexture(
      scene,
      (p.barrelStyle || "standard") as BarrelStyle,
    ),
  };
}

// ─────────────── Texture cache ───────────────
// Each unique loadout builds a canvas texture once and reuses it for
// every player with matching loadout (usually yourself across respawns).

interface HullMeta extends HullRenderResult {
  textureKey: string;
}
interface BarrelMeta extends BarrelRenderResult {
  textureKey: string;
}

const hullMetaCache = new Map<string, HullMeta>();
const barrelMetaCache = new Map<string, BarrelMeta>();

function hullKeyFor(p: Player): string {
  const body = (p.bodyStyle || "heavy") as BodyStyle;
  const turret = (p.turretStyle || "standard") as TurretStyle;
  const pattern = (p.pattern ?? "solid") as PatternStyle;
  const decal = (p.decal ?? "none") as DecalStyle;
  const primary = (p.color & 0xffffff).toString(16).padStart(6, "0");
  const accent  = (p.accentColor & 0xffffff).toString(16).padStart(6, "0");
  const patternColor = (p.patternColor ?? 0x1a140c).toString(16).padStart(6, "0");
  return `tank-hull:${body}:${turret}:${pattern}:${decal}:${primary}:${accent}:${patternColor}`;
}

function ensureHullTexture(scene: Phaser.Scene, p: Player): HullMeta {
  const key = hullKeyFor(p);
  const cached = hullMetaCache.get(key);
  if (cached && scene.textures.exists(key)) return cached;

  const body = (p.bodyStyle || "heavy") as BodyStyle;
  const turret = (p.turretStyle || "standard") as TurretStyle;
  const result = renderHullCanvas({
    bodyStyle: body,
    turretStyle: turret,
    primary: `#${(p.color & 0xffffff).toString(16).padStart(6, "0")}`,
    accent: `#${(p.accentColor & 0xffffff).toString(16).padStart(6, "0")}`,
    pattern: (p.pattern ?? "solid") as PatternStyle,
    patternColor: `#${(p.patternColor ?? 0x1a140c).toString(16).padStart(6, "0")}`,
    decal: (p.decal ?? "none") as DecalStyle,
  });
  scene.textures.addCanvas(key, result.canvas);
  const meta: HullMeta = { ...result, textureKey: key };
  hullMetaCache.set(key, meta);
  // Silence the "unused hull width" lint if ever introduced.
  void HULL_WIDTHS[body];
  return meta;
}

function ensureBarrelTexture(scene: Phaser.Scene, style: BarrelStyle): BarrelMeta {
  const key = `tank-barrel:${style}`;
  const cached = barrelMetaCache.get(key);
  if (cached && scene.textures.exists(key)) return cached;

  const result = renderBarrelCanvas(style);
  scene.textures.addCanvas(key, result.canvas);
  const meta: BarrelMeta = { ...result, textureKey: key };
  barrelMetaCache.set(key, meta);
  return meta;
}
