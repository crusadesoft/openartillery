import { type BarrelStyle, barrelLenMap, barrelThickMap } from "./style";

/** Barrel renderer — draws a horizontal barrel pivoted on the breech end
 *  at (bX, bY) where bY is the center-line of the barrel. `refW` is the
 *  hull width the barrel proportions are scaled against. */
export function drawBarrelAt(
  ctx: CanvasRenderingContext2D,
  bX: number,
  bY: number,
  refW: number,
  barrelStyle: BarrelStyle,
): void {
  const barrelLen = refW * barrelLenMap[barrelStyle];
  const barrelThick = refW * barrelThickMap[barrelStyle];

  if (barrelStyle === "twin") {
    const sub = barrelThick * 0.45;
    const gap = barrelThick * 0.3;
    drawBarrelTube(ctx, bX, bY - gap / 2 - sub / 2, barrelLen, sub, refW, false);
    drawBarrelTube(ctx, bX, bY + gap / 2 + sub / 2, barrelLen, sub, refW, false);
    ctx.fillStyle = "#15171e";
    ctx.fillRect(
      bX - refW * 0.01,
      bY - barrelThick / 2 - 2,
      refW * 0.045,
      barrelThick + 4,
    );
    return;
  }
  drawBarrelTube(ctx, bX, bY, barrelLen, barrelThick, refW, barrelStyle === "rail");
}

function drawBarrelTube(
  ctx: CanvasRenderingContext2D,
  bX: number,
  bY: number,
  barrelLen: number,
  barrelThick: number,
  refW: number,
  isRail: boolean,
): void {
  const bTop = bY - barrelThick / 2;

  ctx.fillStyle = "#15171e";
  ctx.fillRect(bX - refW * 0.01, bTop - 2, refW * 0.035, barrelThick + 4);
  ctx.fillStyle = "#2a2e3a";
  ctx.fillRect(bX - refW * 0.01, bTop, refW * 0.035, barrelThick);

  const bGrad = ctx.createLinearGradient(0, bTop, 0, bTop + barrelThick);
  bGrad.addColorStop(0, isRail ? "#3d4356" : "#2d313e");
  bGrad.addColorStop(0.5, "#181a22");
  bGrad.addColorStop(1, "#070810");
  ctx.fillStyle = bGrad;
  ctx.fillRect(bX, bTop, barrelLen, barrelThick);

  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(bX + 2, bTop + 1, barrelLen - 4, Math.max(0.6, barrelThick * 0.12));
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(bX + barrelLen * 0.45, bTop, Math.max(1, barrelLen * 0.015), barrelThick);

  if (isRail) {
    ctx.fillStyle = "rgba(255,200,120,0.65)";
    for (let i = 0.25; i < 1; i += 0.18) {
      ctx.fillRect(bX + barrelLen * i, bTop - 0.5, 1.5, barrelThick + 1);
    }
    ctx.fillStyle = "rgba(120,200,255,0.85)";
    ctx.fillRect(bX + barrelLen - 3, bTop + barrelThick * 0.15, 3, barrelThick * 0.7);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(bX + barrelLen - 2, bTop + barrelThick * 0.3, 2, barrelThick * 0.4);
    return;
  }

  const muzzleW = Math.max(6, barrelLen * 0.18);
  ctx.fillStyle = "#2b2f3c";
  ctx.fillRect(bX + barrelLen - muzzleW, bTop - 1, muzzleW, barrelThick + 2);
  ctx.fillStyle = "#0a0b10";
  ctx.fillRect(bX + barrelLen - muzzleW + muzzleW * 0.2, bTop + 1, 1, barrelThick - 2);
  ctx.fillRect(bX + barrelLen - muzzleW + muzzleW * 0.55, bTop + 1, 1, barrelThick - 2);
  ctx.fillStyle = "#000";
  ctx.fillRect(bX + barrelLen - 2, bTop + 2, 2, barrelThick - 4);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(bX + barrelLen - muzzleW, bTop, muzzleW, 1);
}
