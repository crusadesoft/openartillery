/**
 * Canvas-rendered tank preview used by CustomizePage, ProfilePage, and
 * the LeaderboardPage vehicle cards. Designed to match the in-game
 * Phaser sprite's visual language (shaded hull, track links, road
 * wheels with hubs, rivets, hatch, antenna, stowage, bolt ring, muzzle
 * brake) so the menu preview and the battle sprite read as the same
 * vehicle.
 *
 * The renderer draws at whatever size you pass in — it scales all
 * detail proportionally, so a 100px card tank and a 600px customize
 * preview stay consistent.
 */

export type BodyStyle = "heavy" | "light" | "assault" | "scout" | "siege";
export type TurretStyle = "standard" | "angular" | "low" | "wedge" | "dome";
export type BarrelStyle = "standard" | "heavy" | "long" | "sniper" | "stubby";
export type PatternStyle = "solid" | "stripes" | "tiger" | "digital" | "chevron";
export type DecalStyle = "none" | "number" | "star" | "skull" | "crosshair";

export interface TankPreviewOpts {
  x: number;             // left edge of tank footprint (incl. treads)
  y: number;             // top edge of tank footprint
  width: number;         // overall tank footprint width
  bodyStyle: BodyStyle;
  turretStyle: TurretStyle;
  barrelStyle: BarrelStyle;
  primary: string;       // hex "#rrggbb"
  accent: string;        // hex "#rrggbb"
  pattern?: PatternStyle;
  patternColor?: string; // hex "#rrggbb" for camo breaks
  decal?: DecalStyle;
  facing?: 1 | -1;
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
  } = opts;

  // Layout — hull height is a fraction of width so treads always scale.
  const hullFracMap: Record<BodyStyle, number> = {
    heavy: 0.34, light: 0.30, assault: 0.26, scout: 0.28, siege: 0.38,
  };
  const slopeFracMap: Record<BodyStyle, number> = {
    heavy: 0.17, light: 0.26, assault: 0.11, scout: 0.32, siege: 0.20,
  };
  const wheelMap: Record<BodyStyle, number> = {
    heavy: 6, light: 4, assault: 5, scout: 4, siege: 7,
  };
  const hullH = W * hullFracMap[bodyStyle];
  const treadH = Math.max(8, W * 0.13);
  const slopeW = W * slopeFracMap[bodyStyle];
  const wheelCount = wheelMap[bodyStyle];
  const hasSkirt = bodyStyle === "assault" || bodyStyle === "siege";
  const hasGlacis = bodyStyle !== "light" && bodyStyle !== "scout";

  const hullTop = y;
  const hullBot = y + hullH;
  const treadTop = hullBot;
  const treadBot = hullBot + treadH;

  ctx.save();

  // Flip horizontally if needed — render into a mirrored transform so
  // hatches, antennae, stowage all flip in place.
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

  // ——— Side skirt (assault) ———
  if (hasSkirt) {
    ctx.fillStyle = primary;
    ctx.fillRect(x + 2, treadTop - treadH * 0.3, W - 4, treadH * 0.42);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 2, treadTop + 1, W - 4, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let lx = x + 6; lx < x + W - 6; lx += 12) ctx.fillRect(lx, treadTop - treadH * 0.22, 1.4, 1.4);
  }

  // ——— Hull (shaded with player primary color) ———
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

  // Glacis plate (darker slope).
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

  // ——— Camo pattern overlay ———
  // Drawn inside the hull rectangle as a semi-transparent overlay so the
  // base shading still reads through. Clipped by a rough hull rect
  // approximation — good enough for the silhouette without the cost of
  // re-building the exact glacis clip path.
  if (pattern !== "solid") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, hullTop + 1, (hasGlacis ? W - slopeW - 4 : W - 8), hullH - 2);
    ctx.clip();
    ctx.fillStyle = patternColor;
    ctx.globalAlpha = 0.55;
    const hullLeft = x + 3;
    const hullRight = x + (hasGlacis ? W - slopeW - 4 : W - 8);
    const hullInnerW = hullRight - hullLeft;
    if (pattern === "stripes") {
      const stripeH = Math.max(2, hullH * 0.12);
      for (let sy = hullTop + stripeH; sy < hullBot; sy += stripeH * 2) {
        ctx.fillRect(hullLeft, sy, hullInnerW, stripeH);
      }
    } else if (pattern === "tiger") {
      const bandW = Math.max(3, hullInnerW * 0.08);
      for (let sx = hullLeft + 2; sx < hullRight; sx += bandW * 2.2) {
        ctx.beginPath();
        ctx.moveTo(sx, hullTop + 1);
        ctx.quadraticCurveTo(sx + bandW * 0.5, hullTop + hullH * 0.5, sx + bandW * 0.2, hullBot - 2);
        ctx.lineTo(sx + bandW, hullBot - 2);
        ctx.quadraticCurveTo(sx + bandW * 1.3, hullTop + hullH * 0.5, sx + bandW * 0.9, hullTop + 1);
        ctx.closePath();
        ctx.fill();
      }
    } else if (pattern === "digital") {
      const cell = Math.max(3, hullInnerW * 0.04);
      for (let sy = hullTop + 1; sy < hullBot - 1; sy += cell) {
        for (let sx = hullLeft; sx < hullRight; sx += cell) {
          // Deterministic pseudo-noise so the pattern is stable between renders.
          const n = ((sx * 374761393) ^ (sy * 668265263)) & 0xff;
          if (n < 80) ctx.fillRect(sx, sy, cell - 0.5, cell - 0.5);
        }
      }
    } else if (pattern === "chevron") {
      const step = Math.max(4, hullInnerW * 0.1);
      const thick = Math.max(1.5, hullH * 0.08);
      for (let sx = hullLeft - hullH; sx < hullRight; sx += step * 1.8) {
        ctx.beginPath();
        ctx.moveTo(sx, hullBot - 1);
        ctx.lineTo(sx + hullH / 2, hullTop + 1);
        ctx.lineTo(sx + hullH / 2 + thick, hullTop + 1);
        ctx.lineTo(sx + thick, hullBot - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Top highlight.
  ctx.fillStyle = shadeHex(primary, 1.55);
  ctx.fillRect(x + 6, hullTop, hasGlacis ? W - slopeW - 8 : W - 12, Math.max(1, W * 0.006));
  // Bottom inner shadow.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 4, hullBot - 2, W - 8, 2);

  // Armor seam.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  const seamY = hullTop + hullH * 0.45;
  ctx.fillRect(x + 6, seamY, hasGlacis ? W - slopeW - 8 : W - 12, Math.max(1, W * 0.005));

  // Rivet rows along top + seam.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const rivetSize = Math.max(1.2, W * 0.008);
  const rivetStep = Math.max(8, W * 0.06);
  for (let rx = x + 10; rx < x + (hasGlacis ? W - slopeW - 4 : W - 6); rx += rivetStep) {
    ctx.fillRect(rx, hullTop + 2, rivetSize, rivetSize);
    ctx.fillRect(rx, seamY + 2, rivetSize * 0.9, rivetSize * 0.9);
  }

  // Accent stripe running along the belt line.
  ctx.fillStyle = accent;
  const stripeY = hullTop + hullH * 0.62;
  ctx.fillRect(x + 8, stripeY, (hasGlacis ? W - slopeW - 10 : W - 16), Math.max(1.2, W * 0.008));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x + 8, stripeY + Math.max(1.2, W * 0.008), (hasGlacis ? W - slopeW - 10 : W - 16), Math.max(0.5, W * 0.003));

  // Hatch (circle).
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
  const turretWMap: Record<TurretStyle, number> = {
    standard: 0.34, angular: 0.36, low: 0.42, wedge: 0.38, dome: 0.32,
  };
  const turretHMap: Record<TurretStyle, number> = {
    standard: 0.22, angular: 0.20, low: 0.14, wedge: 0.22, dome: 0.28,
  };
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
    // Sloped wedge — flat back, forward taper to a prow at the barrel end.
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
    // Tall ellipse with a raised cupola disc on top.
    ctx.ellipse(turretCx, turretCy, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(turretCx, turretCy, turretW / 2, turretH / 2, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  if (turretStyle === "dome") {
    // Cupola ring on top of the main dome.
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

  // Turret crown highlight.
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(turretCx - turretW * 0.15, turretCy - turretH * 0.2, turretW * 0.28, turretH * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Under-turret shadow.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(turretCx, turretCy + turretH * 0.35, turretW * 0.38, turretH * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bolt ring.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const bolts = 10;
  const boltR = Math.max(1, W * 0.007);
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * Math.PI * 2;
    const bx = turretCx + Math.cos(a) * (turretW / 2 - boltR * 3);
    const by = turretCy + Math.sin(a) * (turretH / 2 - boltR * 2.5);
    ctx.beginPath(); ctx.arc(bx, by, boltR, 0, Math.PI * 2); ctx.fill();
  }

  // Periscope.
  ctx.fillStyle = "rgba(15,16,22,0.95)";
  ctx.fillRect(turretCx - W * 0.03, turretCy - turretH * 0.45, W * 0.06, W * 0.022);
  ctx.fillStyle = "rgba(130,170,220,0.75)";
  ctx.fillRect(turretCx - W * 0.02, turretCy - turretH * 0.45 + 1, W * 0.04, Math.max(1, W * 0.007));

  // Smoke-grenade cluster.
  ctx.fillStyle = "rgba(22,22,28,0.95)";
  ctx.fillRect(turretCx + turretW * 0.32, turretCy - W * 0.016, W * 0.032, W * 0.03);

  // ——— Decal ———
  // Stencilled insignia on the hull flank, just behind the turret. White
  // stencil paint with a dark outline so it reads on any hull colour.
  if (decal !== "none") {
    const dSize = Math.max(8, W * 0.08);
    const dcx = x + W * 0.25;
    const dcy = hullTop + hullH * 0.55;
    ctx.save();
    ctx.fillStyle = "rgba(240,234,220,0.92)";
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = Math.max(0.5, W * 0.004);
    if (decal === "star") {
      const r = dSize / 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = dcx + Math.cos(a) * rr;
        const py = dcy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (decal === "number") {
      // Render a two-digit stencil — same digit every time so it reads
      // as a real unit designator. Derived from the primary colour so
      // different tanks sport different numbers.
      const h = (parseInt(primary.slice(1), 16) >>> 0) & 0xff;
      const n = (h % 90) + 10;
      ctx.font = `900 ${dSize * 1.1}px var(--font-display), "Oswald", Impact, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), dcx, dcy);
      ctx.strokeText(String(n), dcx, dcy);
    } else if (decal === "skull") {
      const r = dSize / 2;
      // Cranium
      ctx.beginPath();
      ctx.arc(dcx, dcy - r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Jaw
      ctx.beginPath();
      ctx.ellipse(dcx, dcy + r * 0.35, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Eye sockets
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath(); ctx.arc(dcx - r * 0.3, dcy - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(dcx + r * 0.3, dcy - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
      // Teeth tick
      ctx.fillRect(dcx - r * 0.2, dcy + r * 0.25, r * 0.4, 1);
    } else if (decal === "crosshair") {
      const r = dSize / 2;
      ctx.beginPath(); ctx.arc(dcx, dcy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dcx - r, dcy); ctx.lineTo(dcx + r, dcy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dcx, dcy - r); ctx.lineTo(dcx, dcy + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(dcx, dcy, r * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ——— Barrel ———
  const barrelLenMap: Record<BarrelStyle, number> = {
    standard: 0.46, heavy: 0.42, long: 0.58, sniper: 0.66, stubby: 0.32,
  };
  const barrelThickMap: Record<BarrelStyle, number> = {
    standard: 0.05, heavy: 0.065, long: 0.05, sniper: 0.038, stubby: 0.085,
  };
  const barrelLen = W * barrelLenMap[barrelStyle];
  const barrelThick = W * barrelThickMap[barrelStyle];
  const bX = turretCx + turretW * 0.28;
  const bY = turretCy - barrelThick / 2;

  // Mantle.
  ctx.fillStyle = "#15171e";
  ctx.fillRect(bX - W * 0.01, bY - 2, W * 0.035, barrelThick + 4);
  ctx.fillStyle = "#2a2e3a";
  ctx.fillRect(bX - W * 0.01, bY, W * 0.035, barrelThick);

  // Barrel body gradient.
  const bGrad = ctx.createLinearGradient(0, bY, 0, bY + barrelThick);
  bGrad.addColorStop(0, "#2d313e");
  bGrad.addColorStop(0.5, "#181a22");
  bGrad.addColorStop(1, "#070810");
  ctx.fillStyle = bGrad;
  ctx.fillRect(bX, bY, barrelLen, barrelThick);

  // Top highlight.
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(bX + 2, bY + 1, barrelLen - 4, Math.max(0.6, barrelThick * 0.12));
  // Wear band.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(bX + barrelLen * 0.45, bY, Math.max(1, barrelLen * 0.015), barrelThick);

  // Muzzle brake.
  const muzzleW = Math.max(6, barrelLen * 0.18);
  ctx.fillStyle = "#2b2f3c";
  ctx.fillRect(bX + barrelLen - muzzleW, bY - 1, muzzleW, barrelThick + 2);
  ctx.fillStyle = "#0a0b10";
  ctx.fillRect(bX + barrelLen - muzzleW + muzzleW * 0.2, bY + 1, 1, barrelThick - 2);
  ctx.fillRect(bX + barrelLen - muzzleW + muzzleW * 0.55, bY + 1, 1, barrelThick - 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(bX + barrelLen - 2, bY + 2, 2, barrelThick - 4);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(bX + barrelLen - muzzleW, bY, muzzleW, 1);

  ctx.restore();
}

/** Opinionated full-canvas renderer — same layout the Customize preview
 *  uses so every surface (customize, profile, leaderboard) shows the
 *  vehicle at the same aspect + scale. Callers provide a logical canvas
 *  size; the renderer handles the deck gradient, margin reservations,
 *  and body-proportional tank sizing. */
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

  // Body-proportional sizing so a light hull reads smaller than a heavy
  // one across every surface. Widths follow the in-game hull widths
  // (heavy 48 / light 40 / assault 50 / scout 34 / siege 54).
  const bodyWidthMap: Record<BodyStyle, number> = {
    heavy: 48, light: 40, assault: 50, scout: 34, siege: 54,
  };
  const hullFracMap: Record<BodyStyle, number> = {
    heavy: 0.34, light: 0.30, assault: 0.26, scout: 0.28, siege: 0.38,
  };
  const treadFrac = 0.13;
  const antennaFrac = 0.34 * 0.45; // matches heavy hull antenna reach
  const heavyVFactor = 0.34 + treadFrac + antennaFrac;

  const availH = h - marginTop - marginBottom;
  const baseHeavy = Math.min(availH / heavyVFactor, w - Math.max(12, w * 0.08));
  const maxBody = Math.max(...Object.values(bodyWidthMap));
  const bodyFactor = bodyWidthMap[bodyStyle]! / maxBody;
  // Scale relative to the largest variant so the heaviest hull is our
  // reference — lighter hulls stay proportionally smaller.
  const tankW = baseHeavy * bodyFactor * (maxBody / bodyWidthMap.heavy);

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

export function shadeHex(hex: string, f: number): string {
  const c = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(0, 2), 16) * f)));
  const g = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(2, 4), 16) * f)));
  const b = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(4, 6), 16) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
