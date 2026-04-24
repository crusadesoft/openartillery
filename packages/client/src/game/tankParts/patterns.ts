import type { PatternStyle } from "./style";

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: PatternStyle,
  patternColor: string,
  hullLeft: number,
  hullTop: number,
  hullInnerW: number,
  hullH: number,
): void {
  if (pattern === "solid") return;
  const hullRight = hullLeft + hullInnerW;
  const hullBot = hullTop + hullH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(hullLeft, hullTop + 1, hullInnerW, hullH - 2);
  ctx.clip();
  ctx.fillStyle = patternColor;
  ctx.globalAlpha = 0.55;

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
  } else if (pattern === "splinter") {
    const shardCount = Math.max(6, Math.floor(hullInnerW / 6));
    for (let i = 0; i < shardCount; i++) {
      const seed = i * 374761393;
      const sx = hullLeft + ((seed & 0xff) / 0xff) * hullInnerW;
      const sy = hullTop + (((seed >> 8) & 0xff) / 0xff) * hullH;
      const w = Math.max(3, hullInnerW * 0.06) * (0.7 + ((seed >> 16) & 0xff) / 0xff * 0.7);
      const h = Math.max(2, hullH * 0.22) * (0.6 + ((seed >> 20) & 0xff) / 0xff * 0.6);
      const rot = (((seed >> 24) & 0xff) / 0xff - 0.5) * 0.6;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2 + h * 0.25);
      ctx.lineTo(w / 2 - w * 0.2, h / 2);
      ctx.lineTo(-w / 2 + w * 0.1, h / 2 - h * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (pattern === "urban") {
    // Unsigned 32-bit coercion so pseudo-noise lands in [0, 1) every time
    // instead of occasionally being negative (which made the whole
    // pattern read as solid).
    const rng = (s: number) => (((s * 2654435761) >>> 0) / 0xffffffff);
    const cols = Math.max(4, Math.floor(hullInnerW / 7));
    const rows = Math.max(2, Math.floor(hullH / 3.5));
    const cellW = hullInnerW / cols;
    const cellH = hullH / rows;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const r = rng(cx * 97 + cy * 31 + 13);
        if (r > 0.45) {
          ctx.fillRect(
            hullLeft + cx * cellW,
            hullTop + cy * cellH,
            cellW * 0.9,
            cellH * 0.9,
          );
        }
      }
    }
  } else if (pattern === "hex") {
    const r = Math.max(2.2, hullH * 0.18);
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    for (let row = 0; row * dy < hullH + r; row++) {
      for (let col = 0; col * dx < hullInnerW + dx; col++) {
        const cx = hullLeft + col * dx + (row % 2 ? dx / 2 : 0);
        const cy = hullTop + row * dy;
        if (cx > hullRight || cy > hullBot) continue;
        const seed = row * 101 + col * 37;
        if ((seed * 2654435761 >>> 0) / 0xffffffff < 0.45) {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}
