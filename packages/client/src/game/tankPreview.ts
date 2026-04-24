/**
 * Canvas-rendered tank preview used by CustomizePage, ProfilePage, and
 * the LeaderboardPage vehicle cards. Orchestrates part renderers in
 * `tankParts/`.
 */

import {
  type BarrelStyle,
  type BodyStyle,
  type DecalStyle,
  type PatternStyle,
  type TurretStyle,
  BARREL_REF_W,
  HULL_WIDTHS,
  barrelLenMap,
  barrelThickMap,
  hullFracMap,
  shadeHex,
  turretHMap,
  turretWMap,
} from "./tankParts/style";
import { drawBarrelAt } from "./tankParts/barrel";
import { drawDecal } from "./tankParts/decals";
import { drawPattern } from "./tankParts/patterns";

export type {
  BodyStyle,
  TurretStyle,
  BarrelStyle,
  PatternStyle,
  DecalStyle,
};
export { shadeHex, HULL_WIDTHS };

export interface TankPreviewOpts {
  x: number;
  y: number;
  width: number;
  bodyStyle: BodyStyle;
  turretStyle: TurretStyle;
  barrelStyle: BarrelStyle;
  primary: string;
  accent: string;
  pattern?: PatternStyle;
  patternColor?: string;
  decal?: DecalStyle;
  facing?: 1 | -1;
  /** Skip the barrel when the caller composes it as a separate sprite
   *  (in-game Phaser pipeline rotates it independently for aim). */
  skipBarrel?: boolean;
  /** Rotate the barrel around its breech pivot (radians). */
  barrelAngleRad?: number;
}

export function drawTankPreview(
  ctx: CanvasRenderingContext2D,
  opts: TankPreviewOpts,
): void {
  const {
    x, y, width: W,
    bodyStyle, turretStyle, barrelStyle,
    primary, accent,
    pattern = "solid",
    patternColor = "#1a140c",
    decal = "none",
    facing = 1,
    skipBarrel = false,
  } = opts;

  const slopeFracMap: Record<BodyStyle, number> = {
    heavy: 0.17, light: 0.26, assault: 0.11, scout: 0.32, siege: 0.20,
    bunker: 0.06, recon: 0.38, speeder: 0.30,
  };
  const wheelMap: Record<BodyStyle, number> = {
    heavy: 6, light: 4, assault: 5, scout: 4, siege: 7,
    bunker: 6, recon: 5, speeder: 4,
  };
  const hullH = W * hullFracMap[bodyStyle];
  const treadH = Math.max(8, W * 0.13);
  const slopeW = W * slopeFracMap[bodyStyle];
  const wheelCount = wheelMap[bodyStyle];
  const hasSkirt =
    bodyStyle === "assault" || bodyStyle === "siege" || bodyStyle === "bunker";
  const hasGlacis =
    bodyStyle !== "light" && bodyStyle !== "scout" && bodyStyle !== "speeder";

  const hullTop = y;
  const hullBot = y + hullH;
  const treadTop = hullBot;
  const treadBot = hullBot + treadH;

  ctx.save();

  if (facing < 0) {
    ctx.translate(x + W, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  // ——— Tread belt ———
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(x, treadTop, W, treadH);
  ctx.fillStyle = "#1c1e26";
  const linkW = Math.max(2, W * 0.025);
  for (let lx = x + 2; lx < x + W - 2; lx += linkW + 2) {
    ctx.fillRect(lx, treadTop + 2, linkW, treadH - 4);
  }
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, treadBot - 2, W, 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 4, treadTop + 1, W - 8, 1);

  // ——— Road wheels ———
  const wheelR = treadH * 0.45;
  const wheelY = (treadTop + treadBot) / 2;
  for (let i = 0; i < wheelCount; i++) {
    const cx = x + W * 0.08 + (i * (W * 0.84)) / (wheelCount - 1);
    const grad = ctx.createRadialGradient(cx - wheelR * 0.3, wheelY - wheelR * 0.3, 1, cx, wheelY, wheelR);
    grad.addColorStop(0, "#6a6e7a");
    grad.addColorStop(0.7, "#3a3d47");
    grad.addColorStop(1, "#14161c");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, wheelY, wheelR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0a0b10";
    ctx.beginPath(); ctx.arc(cx, wheelY, wheelR * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.arc(cx - wheelR * 0.2, wheelY - wheelR * 0.2, wheelR * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  if (hasSkirt) {
    ctx.fillStyle = primary;
    ctx.fillRect(x + 2, treadTop - treadH * 0.3, W - 4, treadH * 0.42);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 2, treadTop + 1, W - 4, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let lx = x + 6; lx < x + W - 6; lx += 12) ctx.fillRect(lx, treadTop - treadH * 0.22, 1.4, 1.4);
  }

  // ——— Hull ———
  const hullGrad = ctx.createLinearGradient(0, hullTop, 0, hullBot);
  hullGrad.addColorStop(0, shadeHex(primary, 1.35));
  hullGrad.addColorStop(0.55, primary);
  hullGrad.addColorStop(1, shadeHex(primary, 0.55));
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(x + 4, hullTop + 2);
  ctx.quadraticCurveTo(x + 4, hullTop, x + 8, hullTop);
  if (hasGlacis) {
    ctx.lineTo(x + W - slopeW - 2, hullTop);
    ctx.lineTo(x + W - 4, hullBot);
  } else {
    ctx.lineTo(x + W - 4, hullTop);
    ctx.lineTo(x + W - 4, hullBot);
  }
  ctx.lineTo(x + 4, hullBot);
  ctx.closePath();
  ctx.fill();

  if (hasGlacis) {
    ctx.fillStyle = shadeHex(primary, 0.72);
    ctx.beginPath();
    ctx.moveTo(x + W - slopeW - 2, hullTop);
    ctx.lineTo(x + W - 4, hullBot);
    ctx.lineTo(x + W - 4 - slopeW * 0.4, hullBot);
    ctx.lineTo(x + W - slopeW * 0.55 - 2, hullTop);
    ctx.closePath();
    ctx.fill();
  }

  // Pattern overlay clipped inside the hull rectangle.
  const hullLeft = x + 3;
  const hullInnerW = hasGlacis ? W - slopeW - 4 : W - 8;
  drawPattern(ctx, pattern, patternColor, hullLeft, hullTop, hullInnerW, hullH);

  ctx.fillStyle = shadeHex(primary, 1.55);
  ctx.fillRect(x + 6, hullTop, hasGlacis ? W - slopeW - 8 : W - 12, Math.max(1, W * 0.006));
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 4, hullBot - 2, W - 8, 2);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  const seamY = hullTop + hullH * 0.45;
  ctx.fillRect(x + 6, seamY, hasGlacis ? W - slopeW - 8 : W - 12, Math.max(1, W * 0.005));

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const rivetSize = Math.max(1.2, W * 0.008);
  const rivetStep = Math.max(8, W * 0.06);
  for (let rx = x + 10; rx < x + (hasGlacis ? W - slopeW - 4 : W - 6); rx += rivetStep) {
    ctx.fillRect(rx, hullTop + 2, rivetSize, rivetSize);
    ctx.fillRect(rx, seamY + 2, rivetSize * 0.9, rivetSize * 0.9);
  }

  ctx.fillStyle = accent;
  const stripeY = hullTop + hullH * 0.62;
  ctx.fillRect(x + 8, stripeY, (hasGlacis ? W - slopeW - 10 : W - 16), Math.max(1.2, W * 0.008));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x + 8, stripeY + Math.max(1.2, W * 0.008), (hasGlacis ? W - slopeW - 10 : W - 16), Math.max(0.5, W * 0.003));

  // Hatch.
  const hatchX = x + W * 0.42;
  const hatchY = hullTop + hullH * 0.22;
  const hatchR = Math.max(2, W * 0.025);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.arc(hatchX, hatchY, hatchR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = Math.max(0.6, W * 0.0035);
  ctx.beginPath(); ctx.arc(hatchX, hatchY, hatchR, 0, Math.PI * 2); ctx.stroke();

  // Antenna.
  ctx.strokeStyle = "#0a0a10";
  ctx.lineWidth = Math.max(1, W * 0.008);
  ctx.beginPath();
  ctx.moveTo(x + 10, hullTop);
  ctx.lineTo(x + 10, hullTop - hullH * 0.45);
  ctx.stroke();

  // Rear stowage box.
  const boxW = Math.max(6, W * 0.06);
  const boxH = hullH * 0.55;
  ctx.fillStyle = "rgba(55,50,40,0.9)";
  ctx.fillRect(x + 4, hullTop + 4, boxW, boxH);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x + 4, hullTop + 4, boxW, boxH);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x + 4, hullTop + 4 + boxH * 0.5, boxW, 0.8);

  // ——— Turret ———
  const turretW = W * turretWMap[turretStyle];
  const turretH = W * turretHMap[turretStyle];
  const turretCx = x + W * 0.44;
  const turretCy = hullTop - turretH * 0.25;

  const tGrad = ctx.createLinearGradient(0, turretCy - turretH / 2, 0, turretCy + turretH / 2);
  tGrad.addColorStop(0, shadeHex(primary, 1.45));
  tGrad.addColorStop(0.6, shadeHex(primary, 1.08));
  tGrad.addColorStop(1, shadeHex(primary, 0.55));
  ctx.fillStyle = tGrad;
  ctx.beginPath();
  if (turretStyle === "angular") {
    const rx = turretW / 2;
    const ry = turretH / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = turretCx + Math.cos(a) * rx;
      const py = turretCy + Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (turretStyle === "low") {
    ctx.ellipse(turretCx, turretCy + turretH * 0.15, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  } else if (turretStyle === "wedge") {
    const back = turretCx - turretW / 2;
    const front = turretCx + turretW / 2;
    const top = turretCy - turretH / 2;
    const bot = turretCy + turretH / 2;
    ctx.moveTo(back, top + turretH * 0.2);
    ctx.lineTo(turretCx + turretW * 0.1, top);
    ctx.lineTo(front, turretCy - turretH * 0.15);
    ctx.lineTo(front, turretCy + turretH * 0.15);
    ctx.lineTo(turretCx + turretW * 0.1, bot);
    ctx.lineTo(back, bot - turretH * 0.2);
    ctx.closePath();
  } else if (turretStyle === "dome") {
    ctx.ellipse(turretCx, turretCy, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  } else if (turretStyle === "box") {
    const lowerW = turretW;
    const upperW = turretW * 0.55;
    const upperH = turretH * 0.55;
    const lowerH = turretH * 0.9;
    const lB = turretCx - lowerW / 2;
    const rB = turretCx + lowerW / 2;
    const topB = turretCy - lowerH * 0.25;
    const botB = turretCy + lowerH * 0.75;
    ctx.moveTo(lB + 2, topB);
    ctx.lineTo(turretCx - upperW / 2, topB);
    ctx.lineTo(turretCx - upperW / 2, topB - upperH);
    ctx.lineTo(turretCx + upperW / 2, topB - upperH);
    ctx.lineTo(turretCx + upperW / 2, topB);
    ctx.lineTo(rB - 2, topB);
    ctx.quadraticCurveTo(rB, topB, rB, topB + 2);
    ctx.lineTo(rB, botB);
    ctx.lineTo(lB, botB);
    ctx.lineTo(lB, topB + 2);
    ctx.quadraticCurveTo(lB, topB, lB + 2, topB);
    ctx.closePath();
  } else if (turretStyle === "tall") {
    const w0 = turretW * 1.0;
    const w1 = turretW * 0.72;
    const w2 = turretW * 0.38;
    const h0 = turretH * 0.4;
    const h1 = turretH * 0.38;
    const h2 = turretH * 0.28;
    const baseY = turretCy + turretH * 0.5;
    ctx.moveTo(turretCx - w0 / 2, baseY);
    ctx.lineTo(turretCx - w0 / 2, baseY - h0);
    ctx.lineTo(turretCx - w1 / 2, baseY - h0);
    ctx.lineTo(turretCx - w1 / 2, baseY - h0 - h1);
    ctx.lineTo(turretCx - w2 / 2, baseY - h0 - h1);
    ctx.lineTo(turretCx - w2 / 2, baseY - h0 - h1 - h2);
    ctx.lineTo(turretCx + w2 / 2, baseY - h0 - h1 - h2);
    ctx.lineTo(turretCx + w2 / 2, baseY - h0 - h1);
    ctx.lineTo(turretCx + w1 / 2, baseY - h0 - h1);
    ctx.lineTo(turretCx + w1 / 2, baseY - h0);
    ctx.lineTo(turretCx + w0 / 2, baseY - h0);
    ctx.lineTo(turretCx + w0 / 2, baseY);
    ctx.closePath();
  } else if (turretStyle === "twin") {
    ctx.ellipse(turretCx, turretCy, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(turretCx, turretCy, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  if (turretStyle === "dome") {
    const cupR = turretW * 0.16;
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.ellipse(turretCx, turretCy - turretH * 0.35, cupR, cupR * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(turretCx, turretCy - turretH * 0.28, cupR * 0.85, cupR * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (turretStyle === "tall") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let k = 0; k < 3; k++) {
      const band = turretCy - turretH * 0.35 + k * (turretH * 0.25);
      ctx.fillRect(turretCx - turretW / 2 + 2, band, turretW - 4, 1);
    }
    ctx.strokeStyle = "#0a0a10";
    ctx.lineWidth = Math.max(0.8, W * 0.006);
    ctx.beginPath();
    ctx.moveTo(turretCx, turretCy - turretH / 2);
    ctx.lineTo(turretCx, turretCy - turretH / 2 - turretH * 0.5);
    ctx.stroke();
  }
  if (turretStyle === "box") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const slitY = turretCy - turretH * 0.1;
    ctx.fillRect(turretCx - turretW * 0.3, slitY, turretW * 0.6, Math.max(1, turretH * 0.08));
    for (let k = 0; k < 4; k++) {
      const bx = turretCx - turretW * 0.3 + k * (turretW * 0.2);
      ctx.beginPath();
      ctx.arc(bx, turretCy + turretH * 0.28, Math.max(0.8, W * 0.007), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (turretStyle === "twin") {
    const portR = Math.min(turretH * 0.16, turretW * 0.09);
    const portX = turretCx + turretW * 0.28;
    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.beginPath(); ctx.arc(portX, turretCy - turretH * 0.22, portR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(portX, turretCy + turretH * 0.22, portR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(portX, turretCy - turretH * 0.22, portR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(portX, turretCy + turretH * 0.22, portR, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(turretCx - turretW * 0.15, turretCy - turretH * 0.2, turretW * 0.28, turretH * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(turretCx, turretCy + turretH * 0.35, turretW * 0.38, turretH * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  if (turretStyle !== "box" && turretStyle !== "tall") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const bolts = 10;
    const boltR = Math.max(1, W * 0.007);
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2;
      const bx = turretCx + Math.cos(a) * (turretW / 2 - boltR * 3);
      const by = turretCy + Math.sin(a) * (turretH / 2 - boltR * 2.5);
      ctx.beginPath(); ctx.arc(bx, by, boltR, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(15,16,22,0.95)";
  ctx.fillRect(turretCx - W * 0.03, turretCy - turretH * 0.45, W * 0.06, W * 0.022);
  ctx.fillStyle = "rgba(130,170,220,0.75)";
  ctx.fillRect(turretCx - W * 0.02, turretCy - turretH * 0.45 + 1, W * 0.04, Math.max(1, W * 0.007));

  ctx.fillStyle = "rgba(22,22,28,0.95)";
  ctx.fillRect(turretCx + turretW * 0.32, turretCy - W * 0.016, W * 0.032, W * 0.03);

  drawDecal(ctx, decal, x + W * 0.25, hullTop + hullH * 0.55, W, primary);

  if (!skipBarrel) {
    const bX = turretCx + turretW * 0.28;
    const bY = turretCy;
    const angle = opts.barrelAngleRad ?? 0;
    if (angle !== 0) {
      ctx.save();
      ctx.translate(bX, bY);
      ctx.rotate(angle);
      drawBarrelAt(ctx, 0, 0, W, barrelStyle);
      ctx.restore();
    } else {
      drawBarrelAt(ctx, bX, bY, W, barrelStyle);
    }
  }

  ctx.restore();
}

export interface RenderLoadoutOpts {
  width: number;
  height: number;
  bodyStyle: BodyStyle;
  turretStyle: TurretStyle;
  barrelStyle: BarrelStyle;
  primary: string;
  accent: string;
  pattern?: PatternStyle;
  patternColor?: string;
  decal?: DecalStyle;
  showDeck?: boolean;
  marginTop?: number;
  marginBottom?: number;
}

export function renderLoadoutCanvas(
  ctx: CanvasRenderingContext2D,
  opts: RenderLoadoutOpts,
): void {
  const {
    width: w, height: h,
    bodyStyle, turretStyle, barrelStyle,
    primary, accent,
    pattern, patternColor, decal,
    showDeck = true,
    marginTop = Math.max(18, h * 0.16),
    marginBottom = Math.max(14, h * 0.13),
  } = opts;

  ctx.clearRect(0, 0, w, h);

  if (showDeck) {
    const deck = ctx.createLinearGradient(0, h - h * 0.35, 0, h);
    deck.addColorStop(0, "rgba(20, 16, 12, 0.0)");
    deck.addColorStop(1, "rgba(90, 50, 20, 0.5)");
    ctx.fillStyle = deck;
    ctx.fillRect(0, h - h * 0.35, w, h * 0.35);
  }

  const treadFrac = 0.13;
  const antennaFrac = 0.34 * 0.45;
  const heavyVFactor = 0.34 + treadFrac + antennaFrac;

  const availH = h - marginTop - marginBottom;
  const baseHeavy = Math.min(availH / heavyVFactor, w - Math.max(12, w * 0.08));
  const maxBody = Math.max(...Object.values(HULL_WIDTHS));
  const bodyFactor = HULL_WIDTHS[bodyStyle]! / maxBody;
  // Scale relative to the largest variant so the heaviest hull is our
  // reference — lighter hulls stay proportionally smaller.
  const tankW = baseHeavy * bodyFactor * (maxBody / HULL_WIDTHS.heavy);

  const hullFrac = hullFracMap[bodyStyle]!;
  const hullH = tankW * hullFrac;
  const treadH = Math.max(8, tankW * treadFrac);
  const totalH = hullH + treadH;
  const x0 = w / 2 - tankW / 2;
  const y0 = h - marginBottom - totalH;

  drawTankPreview(ctx, {
    x: x0,
    y: y0,
    width: tankW,
    bodyStyle,
    turretStyle,
    barrelStyle,
    primary,
    accent,
    pattern,
    patternColor,
    decal,
  });
}

export interface HullRenderOpts {
  bodyStyle: BodyStyle;
  turretStyle: TurretStyle;
  primary: string;
  accent: string;
  pattern: PatternStyle;
  patternColor: string;
  decal: DecalStyle;
}

export interface HullRenderResult {
  canvas: HTMLCanvasElement;
  widthLogical: number;
  heightLogical: number;
  barrelPivotX: number;
  barrelPivotY: number;
  hullCenterX: number;
  hullCenterY: number;
}

const TEXTURE_SCALE = 2;

export function renderHullCanvas(opts: HullRenderOpts): HullRenderResult {
  const W = HULL_WIDTHS[opts.bodyStyle];
  const hullH = W * hullFracMap[opts.bodyStyle];
  const treadH = Math.max(8, W * 0.13);
  const turretH = W * turretHMap[opts.turretStyle];
  const turretExtendUp = turretH * 0.75 + 0.25 * turretH;
  const antennaUp = hullH * 0.45 + 4;
  const topPad = Math.ceil(Math.max(turretExtendUp, antennaUp));
  const sidePad = 2;
  const logicalW = W + sidePad * 2;
  const logicalH = topPad + hullH + treadH + 2;

  const canvas = document.createElement("canvas");
  canvas.width = logicalW * TEXTURE_SCALE;
  canvas.height = logicalH * TEXTURE_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);

  drawTankPreview(ctx, {
    x: sidePad,
    y: topPad,
    width: W,
    bodyStyle: opts.bodyStyle,
    turretStyle: opts.turretStyle,
    barrelStyle: "standard",
    primary: opts.primary,
    accent: opts.accent,
    pattern: opts.pattern,
    patternColor: opts.patternColor,
    decal: opts.decal,
    skipBarrel: true,
  });

  const turretW = W * turretWMap[opts.turretStyle];
  const turretCx = sidePad + W * 0.44;
  const turretCy = topPad - turretH * 0.25;
  const barrelPivotX = turretCx + turretW * 0.28;
  const barrelPivotY = turretCy;

  const hullCenterX = sidePad + W / 2;
  const hullCenterY = topPad + hullH / 2;

  return {
    canvas,
    widthLogical: logicalW,
    heightLogical: logicalH,
    barrelPivotX, barrelPivotY,
    hullCenterX, hullCenterY,
  };
}

export interface BarrelRenderResult {
  canvas: HTMLCanvasElement;
  widthLogical: number;
  heightLogical: number;
  pivotX: number;
  pivotY: number;
}

export function renderBarrelCanvas(barrelStyle: BarrelStyle): BarrelRenderResult {
  const W = BARREL_REF_W;
  const barrelLen = W * barrelLenMap[barrelStyle];
  const barrelThick = W * barrelThickMap[barrelStyle];
  const padL = Math.ceil(W * 0.015) + 2;
  const padR = 2;
  const padV = 3;
  const logicalW = padL + barrelLen + padR;
  const logicalH = padV + barrelThick + padV;

  const canvas = document.createElement("canvas");
  canvas.width = logicalW * TEXTURE_SCALE;
  canvas.height = logicalH * TEXTURE_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);

  const bX = padL;
  const bY = padV + barrelThick / 2;
  drawBarrelAt(ctx, bX, bY, W, barrelStyle);

  return {
    canvas,
    widthLogical: logicalW,
    heightLogical: logicalH,
    pivotX: bX,
    pivotY: bY,
  };
}
