import Phaser from "phaser";
import type { TerrainState } from "@artillery/shared";
import { BIOMES, type BiomeId, WORLD } from "@artillery/shared";

interface FloraCfg {
  texture: string;
  density: number; // sprites per pixel of width
  minScale: number;
  maxScale: number;
  yOffset: number;
  tintJitter?: number;
  depth?: number;
}

/**
 * Biome-aware terrain renderer. Draws sky + parallax mountains + ground +
 * flora + atmospheric props (clouds, moon/sun, aurora, embers) so each
 * biome reads as its own locale instead of a colored band.
 */
const BIOME_TEXTURE: Record<BiomeId, string> = {
  grasslands: "terrain_grasslands",
  desert: "terrain_desert",
  arctic: "terrain_arctic",
  lava: "terrain_lava",
  dusk: "terrain_dusk",
};

export class TerrainView {
  /** Shape of the heightmap, used as a geometry mask for the texture tiles. */
  private maskShape: Phaser.GameObjects.Graphics;
  /** Top-soil texture (surface colour). */
  private topTile?: Phaser.GameObjects.TileSprite;
  /** Deeper dirt — same texture with a darker tint for layered depth. */
  private deepTile?: Phaser.GameObjects.TileSprite;
  private topline: Phaser.GameObjects.Graphics;
  private sky!: Phaser.GameObjects.Graphics;
  private mountainFar!: Phaser.GameObjects.Graphics;
  private mountainNear!: Phaser.GameObjects.Graphics;
  private celestial?: Phaser.GameObjects.Image;
  private aurora?: Phaser.GameObjects.Graphics;
  private clouds: Phaser.GameObjects.Image[] = [];
  private flora: Phaser.GameObjects.Image[] = [];
  private emberEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  private dirty = true;
  private biome: BiomeId;
  private lastBiomeDrawn: BiomeId | null = null;

  constructor(
    private scene: Phaser.Scene,
    private state: TerrainState,
    initialBiome: BiomeId,
  ) {
    this.biome = initialBiome;
    this.sky = scene.add.graphics().setDepth(-4).setScrollFactor(0);
    this.mountainFar = scene.add.graphics().setDepth(-2).setScrollFactor(0.35);
    this.mountainNear = scene.add.graphics().setDepth(-1).setScrollFactor(0.6);
    this.maskShape = scene.add.graphics().setDepth(1).setVisible(false);
    this.topline = scene.add.graphics().setDepth(2);
    this.redraw();
  }

  markDirty(): void { this.dirty = true; }

  setBiome(biome: BiomeId): void {
    if (biome === this.biome) return;
    this.biome = biome;
    this.dirty = true;
    this.tearDownAtmosphere();
  }

  update(): void {
    if (!this.dirty && this.lastBiomeDrawn === this.biome) return;
    this.redraw();
    this.dirty = false;
    this.lastBiomeDrawn = this.biome;
  }

  private redraw(): void {
    this.drawSky();
    this.drawMountains();
    this.drawGround();
    this.scatterFlora();
    this.installAtmosphere();
  }

  private drawSky(): void {
    const palette = BIOMES[this.biome];
    const camW = this.scene.scale.width;
    const camH = this.scene.scale.height;
    this.sky.clear();
    this.sky.fillGradientStyle(
      palette.skyTop, palette.skyTop,
      palette.skyBottom, palette.skyBottom,
      1,
    );
    this.sky.fillRect(
      0, 0,
      Math.max(camW, WORLD.WIDTH),
      Math.max(camH, WORLD.HEIGHT),
    );
  }

  private installAtmosphere(): void {
    this.tearDownAtmosphere();
    const biome = this.biome;
    // Moon / sun decals + clouds were hand-drawn and read as placeholder
    // art next to real photographic terrain, so they're intentionally
    // disabled. Aurora (arctic) + embers (lava) stay because they're
    // particle-driven and still read.
    if (biome === "arctic") {
      this.aurora = this.scene.add
        .graphics()
        .setDepth(-3)
        .setScrollFactor(0.1);
      this.drawAurora();
    }

    if (biome === "lava") {
      this.emberEmitter = this.scene.add
        .particles(0, 0, "spark", {
          lifespan: 2400,
          speedY: { min: -40, max: -80 },
          speedX: { min: -20, max: 20 },
          scale: { start: 0.5, end: 0 },
          tint: [0xff5a20, 0xffa23a, 0xff2a2a],
          blendMode: Phaser.BlendModes.ADD,
          quantity: 1,
          frequency: 80,
          x: { min: 0, max: WORLD.WIDTH },
          y: { min: WORLD.HEIGHT - 200, max: WORLD.HEIGHT },
        })
        .setDepth(3);
    }
  }

  private drawAurora(): void {
    if (!this.aurora) return;
    const g = this.aurora;
    g.clear();
    const w = this.scene.scale.width;
    const baseY = 140;
    for (let band = 0; band < 3; band++) {
      const color = band === 0 ? 0x5affc1 : band === 1 ? 0x5ea6ff : 0xaf5fff;
      g.fillStyle(color, 0.16);
      g.beginPath();
      g.moveTo(-40, baseY + band * 30);
      for (let x = -40; x <= w + 40; x += 20) {
        const y = baseY + band * 30 + Math.sin(x * 0.02 + band) * 14;
        g.lineTo(x, y);
      }
      for (let x = w + 40; x >= -40; x -= 20) {
        const y = baseY + band * 30 + 40 + Math.sin(x * 0.02 + band) * 14;
        g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    }
    this.scene.tweens.add({
      targets: g,
      alpha: 0.6,
      yoyo: true,
      repeat: -1,
      duration: 3500,
      ease: "Sine.easeInOut",
    });
  }

  private tearDownAtmosphere(): void {
    this.celestial?.destroy(); this.celestial = undefined;
    this.aurora?.destroy(); this.aurora = undefined;
    this.clouds.forEach((c) => c.destroy()); this.clouds = [];
    if (this.emberEmitter) {
      this.emberEmitter.stop();
      this.emberEmitter.destroy();
      this.emberEmitter = undefined;
    }
  }

  private drawMountains(): void {
    const palette = BIOMES[this.biome];
    drawSilhouette(this.mountainFar, palette.mountainFar, WORLD.WIDTH, 0.48, 0.06, 3.2, 0.6);
    drawSilhouette(this.mountainNear, palette.mountainNear, WORLD.WIDTH, 0.58, 0.09, 4.6, 0.85);
  }

  private drawGround(): void {
    const palette = BIOMES[this.biome];
    const h = this.state.heights;
    const w = this.state.width || WORLD.WIDTH;

    // 1) Rebuild the mask shape from the heightmap — single polygon
    //    hugging the surface and dropping down to the bottom of the world.
    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.beginPath();
    this.maskShape.moveTo(0, WORLD.HEIGHT);
    for (let x = 0; x < w; x++) {
      const y = h[x] ?? WORLD.HEIGHT;
      this.maskShape.lineTo(x, y);
    }
    this.maskShape.lineTo(w - 1, WORLD.HEIGHT);
    this.maskShape.closePath();
    this.maskShape.fillPath();

    // 2) Ensure TileSprite + deep-fill exist, textured to the current biome.
    const texKey = BIOME_TEXTURE[this.biome];
    if (!this.topTile) {
      this.topTile = this.scene.add
        .tileSprite(0, 0, WORLD.WIDTH, WORLD.HEIGHT, texKey)
        .setOrigin(0, 0)
        .setDepth(1);
      this.deepTile = this.scene.add
        .tileSprite(0, 0, WORLD.WIDTH, WORLD.HEIGHT, "terrain_rock")
        .setOrigin(0, 0)
        .setDepth(0.9)
        .setAlpha(0.7);
      const mask = this.maskShape.createGeometryMask();
      this.topTile.setMask(mask);
      this.deepTile.setMask(mask);
    } else {
      this.topTile.setTexture(texKey);
    }

    // Warm the top-soil with a slight biome tint so adjacent biomes read
    // distinct even with similar photographic textures.
    this.topTile.setTint(palette.topsoil);
    this.topTile.tileScaleX = 0.8;
    this.topTile.tileScaleY = 0.8;

    // 3) Grass / bright top-line accent strip — kept as a thin graphic above
    //    the texture so the silhouette reads sharply against the sky.
    this.topline.clear();
    this.topline.lineStyle(2, palette.grass, 1);
    this.topline.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h[x] ?? WORLD.HEIGHT;
      if (x === 0) this.topline.moveTo(x, y);
      else this.topline.lineTo(x, y);
    }
    this.topline.strokePath();
    this.topline.lineStyle(1, 0x000000, 0.35);
    this.topline.beginPath();
    for (let x = 0; x < w; x++) {
      const y = (h[x] ?? WORLD.HEIGHT) + 2;
      if (x === 0) this.topline.moveTo(x, y);
      else this.topline.lineTo(x, y);
    }
    this.topline.strokePath();
  }

  private scatterFlora(): void {
    this.flora.forEach((f) => f.destroy());
    this.flora = [];
    const heights = this.state.heights;
    const w = this.state.width || WORLD.WIDTH;
    const cfgs = this.floraForBiome();
    for (const cfg of cfgs) {
      const count = Math.floor(w * cfg.density);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const terrY = heights[Math.floor(x)] ?? WORLD.HEIGHT;
        const scale =
          cfg.minScale + Math.random() * (cfg.maxScale - cfg.minScale);
        const img = this.scene.add
          .image(x, terrY + cfg.yOffset, cfg.texture)
          .setOrigin(0.5, 1)
          .setScale(scale)
          .setDepth(cfg.depth ?? 2);
        if (cfg.tintJitter) {
          const j = (Math.random() - 0.5) * cfg.tintJitter * 255;
          const tone = Math.max(0, Math.min(255, 180 + j));
          img.setTint((tone << 16) | (tone << 8) | tone);
        }
        if (Math.random() < 0.5) img.setFlipX(true);
        this.flora.push(img);
      }
    }
  }

  private floraForBiome(): FloraCfg[] {
    switch (this.biome) {
      case "grasslands":
        return [
          { texture: "grass_tuft", density: 0.06, minScale: 0.8, maxScale: 1.6, yOffset: 2 },
          { texture: "rock_small", density: 0.004, minScale: 0.7, maxScale: 1.2, yOffset: 1, tintJitter: 0.2 },
        ];
      case "desert":
        return [
          { texture: "cactus", density: 0.004, minScale: 0.9, maxScale: 1.4, yOffset: 2 },
          { texture: "rock_small", density: 0.01, minScale: 0.8, maxScale: 1.5, yOffset: 1, tintJitter: 0.15 },
        ];
      case "arctic":
        return [
          { texture: "pine", density: 0.006, minScale: 0.8, maxScale: 1.5, yOffset: 3 },
          { texture: "rock_small", density: 0.004, minScale: 0.6, maxScale: 1.0, yOffset: 1 },
        ];
      case "lava":
        return [
          { texture: "crystal", density: 0.012, minScale: 0.9, maxScale: 1.6, yOffset: 2 },
          { texture: "lava_crack", density: 0.005, minScale: 0.8, maxScale: 1.4, yOffset: 0, depth: 3 },
        ];
      case "dusk":
        return [
          { texture: "pine", density: 0.003, minScale: 0.9, maxScale: 1.3, yOffset: 3 },
          { texture: "grass_tuft", density: 0.025, minScale: 0.8, maxScale: 1.3, yOffset: 2 },
        ];
    }
  }

  destroy(): void {
    this.maskShape.destroy();
    this.topTile?.destroy();
    this.deepTile?.destroy();
    this.topline.destroy();
    this.sky.destroy();
    this.mountainFar.destroy();
    this.mountainNear.destroy();
    this.tearDownAtmosphere();
    this.flora.forEach((f) => f.destroy());
  }
}

function drawSilhouette(
  gfx: Phaser.GameObjects.Graphics,
  color: number,
  width: number,
  baseline: number,
  amp: number,
  freq: number,
  alpha: number,
): void {
  gfx.clear();
  gfx.fillStyle(color, alpha);
  gfx.beginPath();
  const h = WORLD.HEIGHT;
  const yBase = h * baseline;
  const aa = h * amp;
  gfx.moveTo(0, h);
  const step = 18;
  for (let x = 0; x <= width; x += step) {
    const t = x / width;
    const y =
      yBase -
      Math.sin(t * freq * Math.PI * 2) * aa -
      Math.sin(t * (freq * 2.3 + 0.7) * Math.PI * 2) * aa * 0.4 -
      Math.sin(t * (freq * 0.5 + 0.2) * Math.PI * 2) * aa * 0.2;
    gfx.lineTo(x, y);
  }
  gfx.lineTo(width, h);
  gfx.closePath();
  gfx.fillPath();
}
