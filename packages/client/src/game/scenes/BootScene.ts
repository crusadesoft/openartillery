import Phaser from "phaser";

/**
 * Procedurally builds every sprite the game uses so we ship zero binary
 * assets. Tanks, projectiles, and VFX textures are all drawn here and
 * baked into named textures the scenes reference by key.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "boot" });
  }

  preload(): void {
    // Real CC0 texture photographs (ambientCG) — 1K JPG color maps for
    // biome ground, metal plating on UI accents, and rust/plating on cards.
    this.load.image("terrain_grasslands", "/textures/terrain/grasslands.jpg");
    this.load.image("terrain_desert", "/textures/terrain/desert.jpg");
    this.load.image("terrain_arctic", "/textures/terrain/arctic.jpg");
    this.load.image("terrain_lava", "/textures/terrain/lava.jpg");
    this.load.image("terrain_dusk", "/textures/terrain/dusk.jpg");
    this.load.image("terrain_rock", "/textures/terrain/rock.jpg");
    this.load.image("tank_plates", "/textures/tank/plates.jpg");

    this.makePixelTex("pixel");
    this.makeCircleTex("proj", 10, 0xffffff);
    this.makeCircleTex("spark", 6, 0xffffff);
    this.makeSoftDisk("smoke", 28);

    // Detailed projectile art — one texture per weapon so shells look like
    // shells, grenades look like grenades, etc. Drawn to canvas for the
    // shading that Phaser Graphics can't cheaply give us.
    this.makeProjShell("proj_shell", 28, 12, "#f3d063", "#6a4f18");
    this.makeProjShell("proj_heavy", 36, 16, "#c7602a", "#431b06");
    this.makeProjCluster("proj_cluster", 26, 18);
    this.makeProjDirt("proj_dirt", 22, 22);
    this.makeProjSkipper("proj_skipper", 24, 12);
    this.makeProjGrenade("proj_grenade", 20, 22);
    this.makeProjNapalm("proj_napalm", 26, 16);
    this.makeProjAirstrike("proj_airstrike", 34, 14);
    this.makeProjMirv("proj_mirv", 34, 18);

    // Three variants per part — matches shared/loadout.ts part ids. Each
    // variant has a distinct silhouette so the player sees the difference.
    // Textures are rendered at 2× internal resolution; Tank entity sets a
    // displaySize back to the logical dimensions for supersampled crispness.
    this.makeTankBodyCanvas("tank_body_heavy",   48, 24, { wheels: 6, slope: 9,  glacis: true });
    this.makeTankBodyCanvas("tank_body_light",   40, 20, { wheels: 4, slope: 13, glacis: false });
    this.makeTankBodyCanvas("tank_body_assault", 50, 18, { wheels: 5, slope: 7,  glacis: true,  skirt: true });
    this.makeTankBodyCanvas("tank_body_scout",   36, 16, { wheels: 4, slope: 14, glacis: false });
    this.makeTankBodyCanvas("tank_body_siege",   54, 26, { wheels: 7, slope: 8,  glacis: true,  skirt: true });
    this.makeTurretCanvas("turret_standard", 22, 14, "round");
    this.makeTurretCanvas("turret_angular",  24, 15, "hex");
    this.makeTurretCanvas("turret_low",      26, 12, "low");
    this.makeTurretCanvas("turret_wedge",    26, 15, "wedge");
    this.makeTurretCanvas("turret_dome",     20, 18, "dome");
    this.makeBarrelCanvas("barrel_standard", 26, 5);
    this.makeBarrelCanvas("barrel_heavy",    26, 7);
    this.makeBarrelCanvas("barrel_long",     34, 5);
    this.makeBarrelCanvas("barrel_sniper",   40, 4);
    this.makeBarrelCanvas("barrel_stubby",   18, 8);

    this.makeDebris("debris_chunk", 7, 7);
    this.makeCloud("cloud_a", 180, 46);
    this.makeCloud("cloud_b", 120, 36);
    this.makeMoon("moon", 64);
    this.makeSunHalo("sun_halo", 120);
    this.makeGrassTuft("grass_tuft");
    this.makeRock("rock_small");
    this.makeCactus("cactus");
    this.makePineTree("pine");
    this.makeCrystal("crystal");
    this.makeLavaCrack("lava_crack");
  }

  create(): void {
    this.scene.start("battle");
  }

  // ───────────────────────── primitives ─────────────────────────

  private makePixelTex(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(key, 2, 2);
    g.destroy();
  }

  private makeCircleTex(key: string, d: number, color: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillCircle(d / 2, d / 2, d / 2);
    g.generateTexture(key, d, d);
    g.destroy();
  }

  /** Soft radial falloff disc — perfect for smoke / glow. */
  private makeSoftDisk(key: string, d: number): void {
    const r = d / 2;
    const canvas = document.createElement("canvas");
    canvas.width = d;
    canvas.height = d;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.65)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, d, d);
    this.textures.addCanvas(key, canvas);
  }

  // ───────────────────────── tanks / weapons ───────────────────

  /** Canvas-rendered tank hull with shaded armor, tread links, road
   *  wheels with hubs, rivets, glacis, antenna, stowage. White base so
   *  player tint still applies. Rendered at 2× for supersampled crispness;
   *  consumers call `setDisplaySize(w, h)` with the logical dimensions. */
  private makeTankBodyCanvas(
    key: string,
    w: number,
    h: number,
    opts: {
      wheels?: number;
      slope?: number;
      skirt?: boolean;
      glacis?: boolean;
    } = {},
  ): void {
    const scale = 2;
    const W = w * scale;
    const H = h * scale;
    const wheels = opts.wheels ?? 5;
    const slope = (opts.slope ?? 10) * scale;
    const skirt = !!opts.skirt;
    const hasGlacis = opts.glacis !== false;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Layout bands.
    const treadTop = H - 16;
    const treadBot = H - 2;
    const hullTop = 6;
    const hullBot = treadTop;

    // ——— Tread belt ———
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, treadTop, W, treadBot - treadTop);
    // Track link cross-hatch.
    ctx.fillStyle = "#1c1e26";
    for (let x = 2; x < W - 2; x += 5) {
      ctx.fillRect(x, treadTop + 2, 3, treadBot - treadTop - 4);
    }
    // Lower tread shadow.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, treadBot - 2, W, 2);
    // Top tread highlight sliver.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(4, treadTop + 1, W - 8, 1);

    // ——— Road wheels ———
    const wheelR = (treadBot - treadTop) * 0.48;
    const wheelY = (treadTop + treadBot) / 2;
    for (let i = 0; i < wheels; i++) {
      const cx = W * 0.08 + (i * (W * 0.84)) / (wheels - 1);
      // Tire.
      const grad = ctx.createRadialGradient(cx - 1, wheelY - 1, 1, cx, wheelY, wheelR);
      grad.addColorStop(0, "#6a6e7a");
      grad.addColorStop(0.7, "#3a3d47");
      grad.addColorStop(1, "#14161c");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, wheelY, wheelR, 0, Math.PI * 2); ctx.fill();
      // Hub.
      ctx.fillStyle = "#0a0b10";
      ctx.beginPath(); ctx.arc(cx, wheelY, wheelR * 0.45, 0, Math.PI * 2); ctx.fill();
      // Hub highlight.
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(cx - wheelR * 0.2, wheelY - wheelR * 0.2, wheelR * 0.18, 0, Math.PI * 2); ctx.fill();
    }

    // ——— Side skirt (assault) — overlays top of treads ———
    if (skirt) {
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(2, treadTop - 4, W - 4, 6);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(2, treadTop + 1, W - 4, 1);
      // Mud flap rivets.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      for (let x = 6; x < W - 6; x += 12) ctx.fillRect(x, treadTop - 2, 1.4, 1.4);
    }

    // ——— Hull body (tintable white, shaded top→bottom) ———
    const hullGrad = ctx.createLinearGradient(0, hullTop, 0, hullBot);
    hullGrad.addColorStop(0, "rgba(255,255,255,1)");
    hullGrad.addColorStop(0.55, "rgba(210,210,210,1)");
    hullGrad.addColorStop(1, "rgba(140,140,140,1)");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(4, hullTop + 2);
    ctx.quadraticCurveTo(4, hullTop, 8, hullTop);
    if (hasGlacis) {
      ctx.lineTo(W - slope - 2, hullTop);
      ctx.lineTo(W - 4, hullBot);
    } else {
      ctx.lineTo(W - 4, hullTop);
      ctx.lineTo(W - 4, hullBot);
    }
    ctx.lineTo(4, hullBot);
    ctx.closePath();
    ctx.fill();

    // Glacis plate (darker slope).
    if (hasGlacis) {
      ctx.fillStyle = "rgba(170,170,170,1)";
      ctx.beginPath();
      ctx.moveTo(W - slope - 2, hullTop);
      ctx.lineTo(W - 4, hullBot);
      ctx.lineTo(W - 4 - slope * 0.4, hullBot);
      ctx.lineTo(W - slope * 0.55 - 2, hullTop);
      ctx.closePath();
      ctx.fill();
    }

    // Top edge highlight.
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(6, hullTop, (hasGlacis ? W - slope - 8 : W - 12), 1.6);
    // Bottom inner shadow.
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(4, hullBot - 2, W - 8, 2);

    // Armor plate seam running horizontally.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(6, hullTop + (hullBot - hullTop) * 0.45, (hasGlacis ? W - slope - 8 : W - 12), 1.2);

    // Rivet row (top edge and along seam).
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (let x = 10; x < (hasGlacis ? W - slope - 4 : W - 6); x += 10) {
      ctx.fillRect(x, hullTop + 2, 1.5, 1.5);
      ctx.fillRect(x, hullTop + (hullBot - hullTop) * 0.45 + 2, 1.3, 1.3);
    }

    // Commander hatch (circle) — sits mid-top left of centre.
    const hatchX = W * 0.42;
    const hatchY = hullTop + (hullBot - hullTop) * 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.arc(hatchX, hatchY, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(hatchX, hatchY, 3.2, 0, Math.PI * 2);
    ctx.stroke();

    // Antenna — thin dark line rising above the hull.
    ctx.strokeStyle = "#0a0a10";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10, hullTop);
    ctx.lineTo(10, hullTop - 10);
    ctx.stroke();

    // Rear stowage box.
    ctx.fillStyle = "rgba(60,60,60,0.85)";
    const boxW = 7, boxH = (hullBot - hullTop) * 0.55;
    ctx.fillRect(4, hullTop + 4, boxW, boxH);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(4, hullTop + 4 + boxH * 0.4, boxW, 0.8);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(4, hullTop + 4, boxW, boxH);

    // Side shadow near treads.
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(4, hullBot - 1, W - 8, 1);

    this.textures.addCanvas(key, canvas);
    // Cache logical size for Tank entity to size the sprite correctly.
    (this.textures.get(key) as unknown as { customData?: unknown }).customData = { logicalW: w, logicalH: h };
  }

  private makeTurretCanvas(
    key: string,
    w: number,
    h: number,
    shape: "round" | "hex" | "low" | "wedge" | "dome",
  ): void {
    const scale = 2;
    const W = w * scale;
    const H = h * scale;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const cx = W / 2;
    const cy = H / 2 + 1;

    // Body fill with top→bottom gradient (tintable white base).
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.6, "rgba(200,200,200,1)");
    grad.addColorStop(1, "rgba(120,120,120,1)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (shape === "hex") {
      const rx = W / 2 - 2;
      const ry = H / 2 - 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === "low") {
      ctx.ellipse(cx, cy + 2, W / 2 - 2, H / 2 - 2, 0, 0, Math.PI * 2);
    } else if (shape === "wedge") {
      // Tapered wedge profile — flat back, pointed prow.
      const back = 2;
      const front = W - 2;
      const top = 2;
      const bot = H - 2;
      ctx.moveTo(back, top + H * 0.18);
      ctx.lineTo(cx + W * 0.05, top);
      ctx.lineTo(front, cy - H * 0.18);
      ctx.lineTo(front, cy + H * 0.18);
      ctx.lineTo(cx + W * 0.05, bot);
      ctx.lineTo(back, bot - H * 0.18);
      ctx.closePath();
    } else if (shape === "dome") {
      // Tall dome; cupola added below the main fill.
      ctx.ellipse(cx, cy + 1, W / 2 - 2, H / 2 - 2, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(cx, cy, W / 2 - 2, H / 2 - 2, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Raised cupola ring for dome turrets.
    if (shape === "dome") {
      const cr = W * 0.18;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy - H * 0.32, cr, cr * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(cx, cy - H * 0.25, cr * 0.85, cr * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crown highlight (upper-left).
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(cx - W * 0.15, cy - H * 0.2, W * 0.28, H * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lower shadow curve.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + H * 0.28, W * 0.4, H * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bolt ring around the turret base.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const bolts = 10;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2;
      const bx = cx + Math.cos(a) * (W / 2 - 4);
      const by = cy + Math.sin(a) * (H / 2 - 4);
      ctx.beginPath();
      ctx.arc(bx, by, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Periscope / optics block on top.
    ctx.fillStyle = "rgba(15,16,22,0.95)";
    ctx.fillRect(cx - 3, cy - H * 0.38, 6, 3);
    ctx.fillStyle = "rgba(130,170,220,0.7)";
    ctx.fillRect(cx - 2, cy - H * 0.38 + 0.5, 4, 1);

    // Smoke grenade launcher (small cluster on one side).
    ctx.fillStyle = "rgba(20,20,25,0.95)";
    ctx.fillRect(cx + W * 0.28, cy - 2, 3, 4);
    ctx.fillStyle = "rgba(80,80,88,1)";
    ctx.fillRect(cx + W * 0.28, cy - 2, 3, 0.8);

    this.textures.addCanvas(key, canvas);
    (this.textures.get(key) as unknown as { customData?: unknown }).customData = { logicalW: w, logicalH: h };
  }

  private makeBarrelCanvas(key: string, w: number, h: number): void {
    const scale = 2;
    const W = w * scale;
    const H = h * scale;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Mantle (thicker base at the breech end).
    ctx.fillStyle = "#15171e";
    ctx.fillRect(0, -1, 8, H + 2);
    ctx.fillStyle = "#2a2e3a";
    ctx.fillRect(0, 1, 8, H - 2);

    // Main barrel body — vertical gradient for roundness.
    const barrelGrad = ctx.createLinearGradient(0, 0, 0, H);
    barrelGrad.addColorStop(0, "#2d313e");
    barrelGrad.addColorStop(0.5, "#181a22");
    barrelGrad.addColorStop(1, "#070810");
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(8, 0, W - 18, H);

    // Top specular highlight.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(9, 1, W - 20, 1.2);

    // Wear band (dark ring near mid-barrel).
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(W * 0.45, 0, 1.5, H);

    // Warning stripe (subtle dark ring).
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(W * 0.65, 0, 0.8, H);

    // Muzzle brake — flared end with slots.
    ctx.fillStyle = "#2b2f3c";
    ctx.fillRect(W - 10, -1, 10, H + 2);
    ctx.fillStyle = "#0a0b10";
    ctx.fillRect(W - 8, 1, 1, H - 2);
    ctx.fillRect(W - 5, 1, 1, H - 2);
    // Muzzle tip dark.
    ctx.fillStyle = "#000";
    ctx.fillRect(W - 2, 2, 2, H - 4);
    // Top highlight on muzzle brake.
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(W - 10, 0, 10, 1);

    this.textures.addCanvas(key, canvas);
    (this.textures.get(key) as unknown as { customData?: unknown }).customData = { logicalW: w, logicalH: h };
  }

  private makeTankBody(
    key: string,
    w: number,
    h: number,
    opts: { wheels?: number; slope?: number; skirt?: boolean } = {},
  ): void {
    const wheelCount = opts.wheels ?? 5;
    const slope = opts.slope ?? 10;
    const skirt = !!opts.skirt;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    if (skirt) {
      // Side skirts over the treads — reads as an assault hull.
      g.fillStyle(0xffffff, 1);
      g.fillRect(1, h - 10, w - 2, 4);
    }
    // Tread belt base
    g.fillStyle(0x0b0d17, 1);
    g.fillRoundedRect(0, h - 8, w, 7, 3);
    // Lighter tread highlight
    g.fillStyle(0x22263a, 1);
    g.fillRoundedRect(2, h - 8, w - 4, 2, 1);
    // Tread wheels
    g.fillStyle(0x3d4766, 1);
    for (let i = 0; i < wheelCount; i++) {
      const cx = 6 + i * ((w - 12) / (wheelCount - 1));
      g.fillCircle(cx, h - 4, 3);
    }
    g.fillStyle(0x0b0d17, 1);
    for (let i = 0; i < wheelCount; i++) {
      const cx = 6 + i * ((w - 12) / (wheelCount - 1));
      g.fillCircle(cx, h - 4, 1.4);
    }
    // Hull (tinted at runtime)
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 3, w - 4, h - 11, 4);
    // Sloped front glacis — angle varies with body style.
    g.fillStyle(0xffffff, 0.7);
    g.fillTriangle(w - slope, 3, w - 2, 3, w - 2, h - 10);
    // Hatch circle on top
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(w / 2 - 4, 5, 2);
    // Light top edge highlight
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(2, 3, w - 4, 1);
    // Side shadow stripe
    g.fillStyle(0x000000, 0.18);
    g.fillRect(2, h - 12, w - 4, 2);
    // Tiny antenna at rear
    g.fillStyle(0x0b0d17, 1);
    g.fillRect(3, -6, 1, 8);
    // Bolts
    g.fillStyle(0x000000, 0.3);
    for (let i = 0; i < 5; i++) g.fillCircle(6 + i * 7, 6, 0.9);
    g.generateTexture(key, w, Math.max(h, h));
    g.destroy();
  }

  private makeTurret(
    key: string,
    d: number,
    shape: "round" | "hex" | "low" = "round",
  ): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const cx = d / 2;
    const cy = d / 2;
    g.fillStyle(0xffffff, 1);
    if (shape === "hex") {
      const r = d / 2;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      g.beginPath();
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
      g.closePath();
      g.fillPath();
    } else if (shape === "low") {
      // Short wide squashed dome.
      g.fillEllipse(cx, cy + 2, d, d * 0.6);
    } else {
      g.fillCircle(cx, cy, d / 2);
    }
    // Lower shadow curve
    g.fillStyle(0x000000, 0.22);
    g.fillCircle(cx, cy + 2, d / 2 - 1);
    // Highlight crown
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(cx - 2, cy - 2, d / 2 - 5);
    // Bolts around
    g.fillStyle(0x000000, 0.3);
    for (let a = 0; a < 6; a++) {
      const rad = (a * Math.PI * 2) / 6;
      const px = cx + Math.cos(rad) * (d / 2 - 3);
      const py = cy + Math.sin(rad) * (d / 2 - 3);
      g.fillCircle(px, py, 0.9);
    }
    g.generateTexture(key, d, d);
    g.destroy();
  }

  private makeBarrel(key: string, w: number, h: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Main barrel body
    g.fillStyle(0x1a1d27, 1);
    g.fillRect(0, 0, w, h);
    // Muzzle brake — slightly flared end
    g.fillStyle(0x2c3047, 1);
    g.fillRect(w - 7, -1, 7, h + 2);
    g.fillStyle(0x000000, 1);
    g.fillRect(w - 4, 1, 1, h - 2);
    // Highlight top edge
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(1, 0, w - 2, 1);
    // Bottom shadow
    g.fillStyle(0x000000, 0.4);
    g.fillRect(1, h - 1, w - 2, 1);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // ───────────────────────── projectile art ───────────────────
  // Each projectile is drawn to canvas with shading so it reads as an
  // actual piece of ordnance at 20-36px rather than a tinted disc.

  private makeProjShell(
    key: string,
    w: number,
    h: number,
    bodyColor: string,
    capColor: string,
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const cy = h / 2;
    // Brass body with vertical gradient (top highlight / bottom shadow).
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, this.lighten(bodyColor, 0.35));
    body.addColorStop(0.5, bodyColor);
    body.addColorStop(1, this.darken(bodyColor, 0.45));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(w * 0.6, 2);
    ctx.lineTo(w * 0.95, cy);
    ctx.lineTo(w * 0.6, h - 2);
    ctx.lineTo(0, h - 2);
    ctx.closePath();
    ctx.fill();
    // Olive-drab warhead cap.
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.moveTo(w * 0.55, 2);
    ctx.lineTo(w * 0.78, 2);
    ctx.lineTo(w * 0.95, cy);
    ctx.lineTo(w * 0.78, h - 2);
    ctx.lineTo(w * 0.55, h - 2);
    ctx.closePath();
    ctx.fill();
    // Drive band near base — dark copper strip.
    ctx.fillStyle = "rgba(60,30,10,0.85)";
    ctx.fillRect(w * 0.15, 2, 2, h - 4);
    ctx.fillRect(w * 0.28, 2, 1, h - 4);
    // Top specular highlight.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(2, 3, w * 0.55, 1);
    // Base rim shadow.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 2, 1.2, h - 4);
    this.textures.addCanvas(key, canvas);
  }

  private makeProjCluster(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Ribbed canister body.
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#8a8f78");
    body.addColorStop(1, "#3a3e30");
    ctx.fillStyle = body;
    ctx.fillRect(1, 2, w - 6, h - 4);
    // Nose cone.
    ctx.fillStyle = "#2a2d22";
    ctx.beginPath();
    ctx.moveTo(w - 6, 2);
    ctx.lineTo(w - 1, h / 2);
    ctx.lineTo(w - 6, h - 2);
    ctx.closePath();
    ctx.fill();
    // Rib rings along body.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let x = 3; x < w - 6; x += 4) ctx.fillRect(x, 2, 1, h - 4);
    // Yellow hazard stripe.
    ctx.fillStyle = "#e6c23a";
    ctx.fillRect(4, h / 2 - 1, w - 12, 2);
    // Tail fins.
    ctx.fillStyle = "#1a1c14";
    ctx.fillRect(0, 0, 3, 3);
    ctx.fillRect(0, h - 3, 3, 3);
    this.textures.addCanvas(key, canvas);
  }

  private makeProjDirt(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Irregular clod — multiple overlapping blobs.
    const blobs: [number, number, number, string][] = [
      [w * 0.5, h * 0.55, Math.min(w, h) * 0.42, "#6a4a25"],
      [w * 0.35, h * 0.4, Math.min(w, h) * 0.28, "#7a5a2f"],
      [w * 0.65, h * 0.6, Math.min(w, h) * 0.3, "#5a3a1d"],
      [w * 0.5, h * 0.32, Math.min(w, h) * 0.18, "#8a6a3c"],
    ];
    for (const [cx, cy, r, c] of blobs) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Darker specks for grit.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (let i = 0; i < 10; i++) {
      const x = 2 + Math.random() * (w - 4);
      const y = 2 + Math.random() * (h - 4);
      ctx.fillRect(x, y, 1, 1);
    }
    // Highlight.
    ctx.fillStyle = "rgba(255,230,180,0.4)";
    ctx.beginPath();
    ctx.arc(w * 0.4, h * 0.35, 2, 0, Math.PI * 2);
    ctx.fill();
    this.textures.addCanvas(key, canvas);
  }

  private makeProjSkipper(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Flat puck — elliptical body.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#c43a5a");
    grad.addColorStop(1, "#6a1528");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Equator highlight ring.
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, h / 2);
    ctx.lineTo(w - 2, h / 2);
    ctx.stroke();
    // Top glint.
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(w * 0.4, h * 0.3, w * 0.2, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    this.textures.addCanvas(key, canvas);
  }

  private makeProjGrenade(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Pineapple body.
    const body = ctx.createRadialGradient(
      w * 0.4, h * 0.4, 1, w * 0.5, h * 0.55, w * 0.55,
    );
    body.addColorStop(0, "#6b8a3a");
    body.addColorStop(1, "#2a3a14");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.6, w / 2 - 2, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cross-hatch segments.
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = h * 0.3 + i * (h * 0.2);
      ctx.beginPath();
      ctx.moveTo(3, y);
      ctx.lineTo(w - 3, y);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const x = 3 + i * (w / 4);
      ctx.beginPath();
      ctx.moveTo(x, h * 0.3);
      ctx.lineTo(x, h * 0.9);
      ctx.stroke();
    }
    // Neck + spoon (lever).
    ctx.fillStyle = "#4a4a42";
    ctx.fillRect(w / 2 - 2, 2, 4, h * 0.22);
    ctx.fillStyle = "#bfbfa8";
    ctx.fillRect(w / 2 + 2, 3, w * 0.28, 2);
    // Pin ring.
    ctx.strokeStyle = "#d8c078";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2 - 3, 3, 2, 0, Math.PI * 2);
    ctx.stroke();
    this.textures.addCanvas(key, canvas);
  }

  private makeProjNapalm(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Canister body.
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#c95a2a");
    body.addColorStop(1, "#5a1c08");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(w - 7, 2);
    ctx.lineTo(w - 2, h / 2);
    ctx.lineTo(w - 7, h - 2);
    ctx.lineTo(2, h - 2);
    ctx.closePath();
    ctx.fill();
    // Black hazard stripes.
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    for (let x = 4; x < w - 8; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x + 2, 2);
      ctx.lineTo(x, h - 2);
      ctx.lineTo(x - 2, h - 2);
      ctx.closePath();
      ctx.fill();
    }
    // Yellow warning triangle.
    ctx.fillStyle = "#f2c43a";
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h / 2 - 3);
    ctx.lineTo(w * 0.42, h / 2 - 3);
    ctx.lineTo(w * 0.335, h / 2 + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.fillRect(w * 0.33, h / 2 - 2, 0.8, 2);
    ctx.fillRect(w * 0.33, h / 2 + 0.5, 0.8, 0.8);
    // Highlight band.
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(2, 3, w * 0.7, 1);
    this.textures.addCanvas(key, canvas);
  }

  private makeProjAirstrike(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const cy = h / 2;
    // Laser-guided bomb body (long cylinder).
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#cfd3d8");
    body.addColorStop(1, "#4a5058");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.35);
    ctx.lineTo(w * 0.15, h * 0.2);
    ctx.lineTo(w * 0.7, h * 0.2);
    ctx.lineTo(w - 2, cy);
    ctx.lineTo(w * 0.7, h * 0.8);
    ctx.lineTo(w * 0.15, h * 0.8);
    ctx.lineTo(0, h * 0.65);
    ctx.closePath();
    ctx.fill();
    // Dark seeker head.
    ctx.fillStyle = "#1a1e25";
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.25);
    ctx.lineTo(w * 0.7, h * 0.2);
    ctx.lineTo(w - 2, cy);
    ctx.lineTo(w * 0.7, h * 0.8);
    ctx.lineTo(w * 0.55, h * 0.75);
    ctx.closePath();
    ctx.fill();
    // Tail fins (X-wing silhouette).
    ctx.fillStyle = "#2d323a";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.15, h * 0.2);
    ctx.lineTo(w * 0.15, h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.15, h * 0.8);
    ctx.lineTo(w * 0.15, h * 0.65);
    ctx.closePath();
    ctx.fill();
    // Top highlight.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(w * 0.18, h * 0.22, w * 0.5, 1);
    // Stencil mark.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(w * 0.3, cy - 0.5, w * 0.15, 1);
    this.textures.addCanvas(key, canvas);
  }

  private makeProjMirv(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const cy = h / 2;
    // Main rocket body.
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#d8d8dc");
    body.addColorStop(0.5, "#8a8d96");
    body.addColorStop(1, "#2e3037");
    ctx.fillStyle = body;
    ctx.fillRect(w * 0.15, h * 0.25, w * 0.6, h * 0.5);
    // Nose cone.
    ctx.fillStyle = "#c1494e";
    ctx.beginPath();
    ctx.moveTo(w * 0.75, h * 0.25);
    ctx.lineTo(w - 1, cy);
    ctx.lineTo(w * 0.75, h * 0.75);
    ctx.closePath();
    ctx.fill();
    // Red stripes (missile markings).
    ctx.fillStyle = "#b0272a";
    ctx.fillRect(w * 0.25, h * 0.25, 2, h * 0.5);
    ctx.fillRect(w * 0.55, h * 0.25, 2, h * 0.5);
    // Tail fins — four angled triangles.
    ctx.fillStyle = "#1d2028";
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.25);
    ctx.lineTo(0, 0);
    ctx.lineTo(w * 0.1, h * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.75);
    ctx.lineTo(0, h);
    ctx.lineTo(w * 0.1, h * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, cy - 1, w * 0.18, 2);
    // Top highlight.
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(w * 0.15, h * 0.27, w * 0.58, 1);
    this.textures.addCanvas(key, canvas);
  }

  private lighten(hex: string, t: number): string {
    const { r, g, b } = this.hex(hex);
    return `rgb(${Math.min(255, r + (255 - r) * t)},${Math.min(255, g + (255 - g) * t)},${Math.min(255, b + (255 - b) * t)})`;
  }
  private darken(hex: string, t: number): string {
    const { r, g, b } = this.hex(hex);
    return `rgb(${Math.max(0, r * (1 - t))},${Math.max(0, g * (1 - t))},${Math.max(0, b * (1 - t))})`;
  }
  private hex(hex: string): { r: number; g: number; b: number } {
    const s = hex.replace("#", "");
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }

  /** Classic pointed shell silhouette. */
  private makeShellTex(key: string, w: number, h: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    // Body
    g.fillRoundedRect(0, h * 0.2, w * 0.75, h * 0.6, 2);
    // Tip (triangle)
    g.fillTriangle(w * 0.75, h * 0.2, w, h / 2, w * 0.75, h * 0.8);
    // Band detail
    g.fillStyle(0x000000, 0.3);
    g.fillRect(w * 0.15, h * 0.2, 1, h * 0.6);
    g.fillRect(w * 0.5, h * 0.2, 1, h * 0.6);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeClusterTex(key: string, w: number, h: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, h * 0.2, w, h * 0.6, 3);
    g.fillStyle(0x000000, 0.35);
    for (let i = 0; i < 3; i++) g.fillCircle(4 + i * 5, h / 2, 1.4);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeMirvTex(key: string, w: number, h: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, h * 0.3, w * 0.8, h * 0.4, 2);
    g.fillTriangle(w * 0.8, h * 0.3, w, h / 2, w * 0.8, h * 0.7);
    g.fillTriangle(0, h * 0.3, 3, h * 0.1, 3, h * 0.3);
    g.fillTriangle(0, h * 0.7, 3, h * 0.9, 3, h * 0.7);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // ───────────────────────── world decoration ──────────────────

  private makeDebris(key: string, w: number, h: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, h, w, h, w / 2, 0);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeCloud(key: string, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0.4)");
    ctx.fillStyle = grad;
    // Two overlapping ellipses
    ctx.beginPath();
    ctx.ellipse(w * 0.35, h * 0.55, w * 0.35, h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.65, h * 0.55, w * 0.3, h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.5, h * 0.45, w * 0.22, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    this.textures.addCanvas(key, canvas);
  }

  private makeMoon(key: string, d: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = d;
    canvas.height = d;
    const ctx = canvas.getContext("2d")!;
    const r = d / 2;
    const grad = ctx.createRadialGradient(r - 6, r - 6, 0, r, r, r);
    grad.addColorStop(0, "#fffbe5");
    grad.addColorStop(0.6, "#e6d9a8");
    grad.addColorStop(1, "rgba(200,180,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    // Craters
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath(); ctx.arc(r - 8, r - 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r + 6, r + 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r + 2, r - 10, 2, 0, Math.PI * 2); ctx.fill();
    this.textures.addCanvas(key, canvas);
  }

  private makeSunHalo(key: string, d: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = d;
    canvas.height = d;
    const ctx = canvas.getContext("2d")!;
    const r = d / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "rgba(255,224,150,1)");
    grad.addColorStop(0.25, "rgba(255,180,80,0.9)");
    grad.addColorStop(0.7, "rgba(255,130,60,0.25)");
    grad.addColorStop(1, "rgba(255,100,60,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, d, d);
    this.textures.addCanvas(key, canvas);
  }

  private makeGrassTuft(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x6bdd5a, 1);
    g.fillTriangle(0, 8, 2, 0, 4, 8);
    g.fillTriangle(3, 8, 5, 1, 7, 8);
    g.fillTriangle(6, 8, 8, 0, 10, 8);
    g.fillStyle(0x3ea035, 1);
    g.fillRect(1, 6, 9, 2);
    g.generateTexture(key, 11, 9);
    g.destroy();
  }

  private makeRock(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x7a7466, 1);
    g.fillTriangle(0, 10, 8, 2, 14, 10);
    g.fillStyle(0x433e34, 1);
    g.fillTriangle(7, 10, 11, 5, 14, 10);
    g.fillStyle(0xc8bfa4, 0.4);
    g.fillTriangle(1, 10, 5, 4, 8, 10);
    g.generateTexture(key, 15, 11);
    g.destroy();
  }

  private makeCactus(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3c7a3e, 1);
    g.fillRoundedRect(4, 2, 4, 18, 1);
    g.fillRoundedRect(0, 8, 3, 7, 1);
    g.fillRoundedRect(9, 6, 3, 7, 1);
    g.fillStyle(0x5ea760, 0.7);
    g.fillRect(4, 2, 1, 18);
    g.fillStyle(0x2b5a2d, 0.8);
    g.fillRect(7, 2, 1, 18);
    g.generateTexture(key, 12, 20);
    g.destroy();
  }

  private makePineTree(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3d2817, 1);
    g.fillRect(6, 18, 2, 8);
    g.fillStyle(0x1d3a62, 1);
    g.fillTriangle(0, 18, 14, 18, 7, 6);
    g.fillTriangle(2, 14, 12, 14, 7, 2);
    g.fillStyle(0x2e5aa2, 0.8);
    g.fillTriangle(1, 18, 6, 18, 6, 8);
    g.fillStyle(0xffffff, 0.6);
    g.fillTriangle(3, 18, 7, 18, 7, 12);
    g.fillTriangle(5, 14, 9, 14, 9, 8);
    g.generateTexture(key, 14, 26);
    g.destroy();
  }

  private makeCrystal(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xff2a5a, 0.9);
    g.fillTriangle(0, 12, 6, 0, 12, 12);
    g.fillStyle(0xff7a8a, 1);
    g.fillTriangle(2, 12, 6, 2, 6, 12);
    g.fillStyle(0xffe0ea, 0.55);
    g.fillTriangle(3, 12, 5, 4, 6, 12);
    g.generateTexture(key, 12, 13);
    g.destroy();
  }

  private makeLavaCrack(key: string): void {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 6;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 6);
    grad.addColorStop(0, "rgba(255,120,50,0)");
    grad.addColorStop(0.5, "rgba(255,210,100,0.9)");
    grad.addColorStop(1, "rgba(255,120,50,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    for (let x = 0; x <= 40; x += 4) ctx.lineTo(x, 3 + Math.sin(x * 0.5) * 1.5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = grad as unknown as string;
    ctx.stroke();
    ctx.fillRect(0, 2, 40, 2);
    this.textures.addCanvas(key, canvas);
  }
}
