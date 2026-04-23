import Phaser from "phaser";
import type { Player } from "@artillery/shared";
import { TANK } from "@artillery/shared";
import type { DecalStyle, PatternStyle } from "../tankPreview";

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
 * Visual representation of a Player. Stacks a hull + turret + barrel in a
 * rotation-aware container so the tank tilts to match terrain slope while
 * the turret tracks the aim. Body orientation is controlled purely by the
 * server's `facing` field — which is set from aim, not from driving.
 */
export class TankView {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private stripe: Phaser.GameObjects.Graphics;
  private pattern: Phaser.GameObjects.Graphics;
  private decal: Phaser.GameObjects.Graphics;
  private turret: Phaser.GameObjects.Image;
  private barrel: Phaser.GameObjects.Image;
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

    const bodyKey = `tank_body_${player.bodyStyle || "heavy"}`;
    this.body = scene.add.image(0, 4, bodyKey).setTint(player.color);
    applyLogicalSize(scene, this.body, bodyKey);
    c.add(this.body);

    // ——— Pattern + decal overlays ———
    // Rendered in the same positions/shapes the Customize preview uses
    // so the in-game silhouette matches what the player saw when
    // configuring their tank.
    this.pattern = scene.add.graphics();
    this.drawPattern(
      (player.pattern ?? "solid") as PatternStyle,
      (player.patternColor ?? 0x1a140c) as number,
    );
    c.add(this.pattern);

    // Accent-color stripe across the hull — reads as identity at a glance.
    this.stripe = scene.add.graphics();
    const accent =
      (player as Player & { accentColor?: number }).accentColor ??
      shade(player.color, 1.4);
    this.stripe.fillStyle(accent, 1);
    this.stripe.fillRect(-14, 1, 28, 1.5);
    this.stripe.fillStyle(0x000000, 0.35);
    this.stripe.fillRect(-14, 2.5, 28, 0.5);
    c.add(this.stripe);

    this.decal = scene.add.graphics();
    this.drawDecal(
      (player.decal ?? "none") as DecalStyle,
      player.color,
    );
    c.add(this.decal);

    const turretKey = `turret_${player.turretStyle || "standard"}`;
    this.turret = scene.add
      .image(0, -4, turretKey)
      .setTint(shade(player.color, 1.2));
    applyLogicalSize(scene, this.turret, turretKey);
    c.add(this.turret);

    const barrelKey = `barrel_${player.barrelStyle || "standard"}`;
    this.barrel = scene.add.image(0, -4, barrelKey).setOrigin(0, 0.5);
    this.barrel.setTint(0x1a1d27);
    applyLogicalSize(scene, this.barrel, barrelKey);
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
    this.body.setFlipX(player.facing < 0);
    // Darken body as the tank burns.
    this.body.setTint(player.dead ? 0x3a2418 : player.color);
    this.turret.setTint(player.dead ? 0x2a1a10 : shade(player.color, 1.2));

    if (player.facing > 0) {
      this.barrel.setOrigin(0, 0.5).setPosition(2, -4);
      this.barrel.setRotation(-angleRad);
    } else {
      this.barrel.setOrigin(1, 0.5).setPosition(-2, -4);
      this.barrel.setRotation(angleRad);
    }
    this.turnRing.setVisible(isCurrentTurn && !player.dead);
    this.label.setPosition(player.x, player.y - 34);
    (this.label as unknown as { setAlpha: (a: number) => void }).setAlpha(
      player.dead ? 0.4 : 1,
    );
    if (this.lastHp !== player.hp) {
      this.drawHpBar(player.hp);
      this.lastHp = player.hp;
    }
    // Flame + smoke plume on dead wrecks — only started once.
    if (player.dead && !this.fireEmitter) {
      this.spawnWreckFire();
    }
    // Position the wreck emitters to track the tank as terrain collapses.
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

  /** Camo pattern overlay matching the Customize preview. The hull box
   *  in Tank local coords is roughly (-20, -8) → (20, 8) — the tread
   *  band covers everything below y ≈ 4. */
  private drawPattern(style: PatternStyle, color: number): void {
    this.pattern.clear();
    if (style === "solid") return;
    const x0 = -16, x1 = 14;  // left/right hull extents
    const y0 = -6, y1 = 5;    // top/bottom hull extents
    const hullW = x1 - x0;
    const hullH = y1 - y0;

    // Clip to hull rect so stripes/tiger don't bleed onto treads.
    this.pattern.fillStyle(color, 0.55);
    if (style === "stripes") {
      const stripeH = Math.max(1.5, hullH * 0.16);
      for (let y = y0 + stripeH; y < y1; y += stripeH * 2) {
        this.pattern.fillRect(x0, y, hullW, stripeH);
      }
    } else if (style === "tiger") {
      const bandW = Math.max(1.5, hullW * 0.08);
      for (let x = x0 + 1; x < x1; x += bandW * 2.2) {
        this.pattern.beginPath();
        this.pattern.moveTo(x, y0);
        this.pattern.lineTo(x + bandW * 0.5, (y0 + y1) / 2);
        this.pattern.lineTo(x + bandW * 0.2, y1);
        this.pattern.lineTo(x + bandW, y1);
        this.pattern.lineTo(x + bandW * 1.3, (y0 + y1) / 2);
        this.pattern.lineTo(x + bandW * 0.9, y0);
        this.pattern.closePath();
        this.pattern.fillPath();
      }
    } else if (style === "digital") {
      const cell = 1.5;
      for (let y = y0; y < y1; y += cell) {
        for (let x = x0; x < x1; x += cell) {
          const n = ((x * 374761393) ^ (y * 668265263)) & 0xff;
          if (n < 80) this.pattern.fillRect(x, y, cell - 0.3, cell - 0.3);
        }
      }
    } else if (style === "chevron") {
      const step = Math.max(2, hullW * 0.12);
      const thick = Math.max(0.8, hullH * 0.14);
      for (let x = x0 - hullH; x < x1; x += step * 1.8) {
        this.pattern.beginPath();
        this.pattern.moveTo(x, y1);
        this.pattern.lineTo(x + hullH / 2, y0);
        this.pattern.lineTo(x + hullH / 2 + thick, y0);
        this.pattern.lineTo(x + thick, y1);
        this.pattern.closePath();
        this.pattern.fillPath();
      }
    }
  }

  /** Small stencilled insignia on the hull flank. Matches the shapes
   *  and positioning drawn in the Customize preview. */
  private drawDecal(style: DecalStyle, primary: number): void {
    this.decal.clear();
    if (style === "none") return;
    const cx = -10;  // left flank of hull
    const cy = 2;
    const stencil = 0xf0ead8;
    const outline = 0x000000;
    if (style === "star") {
      const r = 3.2;
      this.decal.fillStyle(stencil, 0.92);
      this.decal.lineStyle(0.6, outline, 0.7);
      this.decal.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) this.decal.moveTo(px, py); else this.decal.lineTo(px, py);
      }
      this.decal.closePath();
      this.decal.fillPath();
      this.decal.strokePath();
    } else if (style === "number") {
      const n = (primary & 0xff) % 90 + 10;
      const text = this.scene.add.text(cx, cy, String(n), {
        fontFamily: "Oswald, Impact, sans-serif",
        fontStyle: "900",
        fontSize: "7px",
        color: "#f0ead8",
        stroke: "#000000",
        strokeThickness: 1,
      }).setOrigin(0.5, 0.5);
      // Text is added directly to the container at the same offset.
      this.container.add(text);
    } else if (style === "skull") {
      const r = 3.2;
      this.decal.fillStyle(stencil, 0.92);
      this.decal.lineStyle(0.5, outline, 0.7);
      this.decal.fillCircle(cx, cy - r * 0.2, r * 0.7);
      this.decal.strokeCircle(cx, cy - r * 0.2, r * 0.7);
      this.decal.fillStyle(0, 0.85);
      this.decal.fillCircle(cx - r * 0.3, cy - r * 0.2, r * 0.18);
      this.decal.fillCircle(cx + r * 0.3, cy - r * 0.2, r * 0.18);
      this.decal.fillStyle(stencil, 0.9);
      this.decal.fillRect(cx - r * 0.4, cy + r * 0.15, r * 0.8, r * 0.25);
    } else if (style === "crosshair") {
      const r = 3;
      this.decal.lineStyle(0.7, stencil, 0.9);
      this.decal.strokeCircle(cx, cy, r);
      this.decal.beginPath();
      this.decal.moveTo(cx - r, cy);
      this.decal.lineTo(cx + r, cy);
      this.decal.moveTo(cx, cy - r);
      this.decal.lineTo(cx, cy + r);
      this.decal.strokePath();
      this.decal.fillStyle(stencil, 0.9);
      this.decal.fillCircle(cx, cy, r * 0.2);
    }
  }

  private drawHpBar(hp: number): void {
    const w = 42;
    const h = 4;
    const x = -w / 2;
    const y = -22;
    const frac = Math.max(0, Math.min(1, hp / TANK.MAX_HP));
    this.hpBar.clear();
    // Casing: hard-edged stencil-style notches
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.hpBar.fillStyle(0x201a12, 1);
    this.hpBar.fillRect(x, y, w, h);
    const color = frac > 0.5 ? 0x85a158 : frac > 0.25 ? 0xd49228 : 0xc03a3a;
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRect(x, y, w * frac, h);
    // Tick marks every 25%
    this.hpBar.fillStyle(0x000000, 0.55);
    for (let i = 1; i < 4; i++) this.hpBar.fillRect(x + (w / 4) * i, y, 1, h);
  }

  destroy(): void {
    this.container.destroy(true);
    this.label.destroy();
  }
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.floor((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

/** BootScene renders tank textures at 2× internal resolution for crispness;
 *  the logical size is stored on the texture's customData. Resize each
 *  sprite to that logical footprint so the tank lays out the same as before
 *  while benefiting from supersampled downscaling on high-DPI displays. */
function applyLogicalSize(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  key: string,
): void {
  const tex = scene.textures.get(key) as unknown as {
    customData?: { logicalW?: number; logicalH?: number };
  };
  const w = tex?.customData?.logicalW;
  const h = tex?.customData?.logicalH;
  if (typeof w === "number" && typeof h === "number") {
    img.setDisplaySize(w, h);
  }
}
