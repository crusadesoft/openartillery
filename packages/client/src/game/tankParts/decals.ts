import type { DecalStyle } from "./style";

export function drawDecal(
  ctx: CanvasRenderingContext2D,
  decal: DecalStyle,
  dcx: number,
  dcy: number,
  W: number,
  _primary: string,
): void {
  if (decal === "none") return;
  const dSize = Math.max(8, W * 0.08);

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
  } else if (decal === "skull") {
    const r = dSize / 2;
    ctx.beginPath();
    ctx.arc(dcx, dcy - r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(dcx, dcy + r * 0.35, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.beginPath(); ctx.arc(dcx - r * 0.3, dcy - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(dcx + r * 0.3, dcy - r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(dcx - r * 0.2, dcy + r * 0.25, r * 0.4, 1);
  } else if (decal === "crosshair") {
    const r = dSize / 2;
    ctx.beginPath(); ctx.arc(dcx, dcy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dcx - r, dcy); ctx.lineTo(dcx + r, dcy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dcx, dcy - r); ctx.lineTo(dcx, dcy + r); ctx.stroke();
    ctx.beginPath(); ctx.arc(dcx, dcy, r * 0.15, 0, Math.PI * 2); ctx.fill();
  } else if (decal === "cross") {
    const r = dSize / 2;
    const armThick = Math.max(1.2, r * 0.22);
    ctx.fillRect(dcx - armThick / 2, dcy - r, armThick, r * 2);
    ctx.strokeRect(dcx - armThick / 2, dcy - r, armThick, r * 2);
    const crossY = dcy - r * 0.35;
    const crossLen = r * 1.2;
    ctx.fillRect(dcx - crossLen / 2, crossY - armThick / 2, crossLen, armThick);
    ctx.strokeRect(dcx - crossLen / 2, crossY - armThick / 2, crossLen, armThick);
  } else if (decal === "flame") {
    const r = dSize / 2;
    ctx.beginPath();
    ctx.moveTo(dcx, dcy + r);
    ctx.bezierCurveTo(
      dcx - r * 0.9, dcy + r * 0.4,
      dcx - r * 0.8, dcy - r * 0.2,
      dcx - r * 0.1, dcy - r * 0.6,
    );
    ctx.bezierCurveTo(
      dcx - r * 0.25, dcy - r * 0.1,
      dcx + r * 0.4, dcy - r * 0.5,
      dcx + r * 0.2, dcy - r,
    );
    ctx.bezierCurveTo(
      dcx + r * 0.9, dcy - r * 0.5,
      dcx + r * 0.9, dcy + r * 0.3,
      dcx, dcy + r,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (decal === "shield") {
    const r = dSize / 2;
    ctx.beginPath();
    ctx.moveTo(dcx - r * 0.85, dcy - r * 0.8);
    ctx.lineTo(dcx + r * 0.85, dcy - r * 0.8);
    ctx.quadraticCurveTo(dcx + r * 0.95, dcy - r * 0.5, dcx + r * 0.8, dcy);
    ctx.quadraticCurveTo(dcx + r * 0.55, dcy + r * 0.6, dcx, dcy + r);
    ctx.quadraticCurveTo(dcx - r * 0.55, dcy + r * 0.6, dcx - r * 0.8, dcy);
    ctx.quadraticCurveTo(dcx - r * 0.95, dcy - r * 0.5, dcx - r * 0.85, dcy - r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(dcx - r * 0.75, dcy - r * 0.55, r * 1.5, r * 0.28);
  }
  ctx.restore();
}
