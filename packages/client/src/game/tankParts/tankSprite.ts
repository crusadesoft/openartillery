/**
 * Painted-SVG tank sprites (prototype).
 *
 * Model: each tank preset is a fully-painted body+turret SVG plus a
 * purpose-built barrel SVG, both living together in
 * `svg/tanks/<preset>/`. Decals are a separate small overlay library in
 * `svg/decals/`. The renderer is a thin compositor — it picks the
 * preset's pair by signature (body × turret × primaryHex) and the
 * decal by name, then drawImages each in place. No code knows what the
 * artwork looks like.
 *
 * Each preset bundle is loaded once at boot via `Image.decode()` so
 * draws can be sync. Anything that doesn't match a preset signature
 * falls through to the canvas renderer (legacy fallback).
 */

import standardBodyUrl from "./svg/tanks/standard/body.svg?url";
import standardBarrelUrl from "./svg/tanks/standard/barrel.svg?url";
import lightReconBodyUrl from "./svg/tanks/lightRecon/body.svg?url";
import lightReconBarrelUrl from "./svg/tanks/lightRecon/barrel.svg?url";
import scoutBodyUrl from "./svg/tanks/scout/body.svg?url";
import scoutBarrelUrl from "./svg/tanks/scout/barrel.svg?url";
import desertReconBodyUrl from "./svg/tanks/desertRecon/body.svg?url";
import desertReconBarrelUrl from "./svg/tanks/desertRecon/barrel.svg?url";
import arcticWolfBodyUrl from "./svg/tanks/arcticWolf/body.svg?url";
import arcticWolfBarrelUrl from "./svg/tanks/arcticWolf/barrel.svg?url";
import jungleStrikeBodyUrl from "./svg/tanks/jungleStrike/body.svg?url";
import jungleStrikeBarrelUrl from "./svg/tanks/jungleStrike/barrel.svg?url";
import blackOpsBodyUrl from "./svg/tanks/blackOps/body.svg?url";
import blackOpsBarrelUrl from "./svg/tanks/blackOps/barrel.svg?url";
import urbanHexBodyUrl from "./svg/tanks/urbanHex/body.svg?url";
import urbanHexBarrelUrl from "./svg/tanks/urbanHex/barrel.svg?url";
import decalStarUrl from "./svg/decals/star.svg?url";
import decalSkullUrl from "./svg/decals/skull.svg?url";
import decalCrosshairUrl from "./svg/decals/crosshair.svg?url";
import decalCrossUrl from "./svg/decals/cross.svg?url";
import decalFlameUrl from "./svg/decals/flame.svg?url";
import decalShieldUrl from "./svg/decals/shield.svg?url";

import type { BodyStyle, DecalStyle, TurretStyle } from "./style";

// ─────────── Tanks (body + barrel as one preset) ───────────

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TankSpriteMeta {
  bodyUrl: string;
  barrelUrl: string;
  /** Body silhouette viewBox; the y is negative because the turret +
   *  antenna extend above the hull's top-left origin. */
  bodyView: ViewBox;
  /** Barrel viewBox with pivot at SVG (0, 0). */
  barrelView: ViewBox;
  /** Hull width the SVGs were authored at; the renderer scales by W/refW. */
  refW: number;
  /** Reference width used when the barrel SVG was authored. All barrels
   *  in this prototype are authored at refW=48 (canvas convention),
   *  independent of the hull's refW. */
  barrelRefW: number;
}

/** Per-preset tank sprites. Keyed by `body:turret:primaryHex` so any
 *  cosmetics combination matching a preset routes to its painted SVG. */
const TANK_SPRITES: Record<string, TankSpriteMeta> = {
  "heavy:standard:3a4a22": {
    bodyUrl: standardBodyUrl, barrelUrl: standardBarrelUrl,
    bodyView: { x: 0, y: -8, w: 48, h: 32.32 },
    barrelView: { x: -1, y: -3.5, w: 24, h: 7 },
    refW: 48, barrelRefW: 48,
  },
  "light:dome:4a5560": {
    bodyUrl: lightReconBodyUrl, barrelUrl: lightReconBarrelUrl,
    bodyView: { x: 0, y: -10, w: 40, h: 30 },
    barrelView: { x: -1, y: -3.5, w: 30, h: 7 },
    refW: 40, barrelRefW: 48,
  },
  "scout:box:4a5520": {
    bodyUrl: scoutBodyUrl, barrelUrl: scoutBarrelUrl,
    bodyView: { x: 0, y: -9, w: 36, h: 27.08 },
    barrelView: { x: -1, y: -4.5, w: 17.5, h: 9 },
    refW: 36, barrelRefW: 48,
  },
  "assault:angular:c9a978": {
    bodyUrl: desertReconBodyUrl, barrelUrl: desertReconBarrelUrl,
    bodyView: { x: 0, y: -8, w: 50, h: 29 },
    barrelView: { x: -1, y: -4, w: 22.5, h: 8 },
    refW: 50, barrelRefW: 48,
  },
  "siege:wedge:dce4ec": {
    bodyUrl: arcticWolfBodyUrl, barrelUrl: arcticWolfBarrelUrl,
    bodyView: { x: 0, y: -10, w: 54, h: 38.52 },
    barrelView: { x: -1, y: -3, w: 33, h: 6 },
    refW: 54, barrelRefW: 48,
  },
  "bunker:low:3a4a22": {
    bodyUrl: jungleStrikeBodyUrl, barrelUrl: jungleStrikeBarrelUrl,
    bodyView: { x: 0, y: -10, w: 46, h: 37.32 },
    barrelView: { x: -1, y: -5.5, w: 13, h: 11 },
    refW: 46, barrelRefW: 48,
  },
  "recon:tall:1a1a1c": {
    bodyUrl: blackOpsBodyUrl, barrelUrl: blackOpsBarrelUrl,
    bodyView: { x: 0, y: -12, w: 42, h: 32.6 },
    barrelView: { x: -1, y: -3, w: 36.5, h: 6 },
    refW: 42, barrelRefW: 48,
  },
  "speeder:twin:6a6e72": {
    bodyUrl: urbanHexBodyUrl, barrelUrl: urbanHexBarrelUrl,
    bodyView: { x: 0, y: -7, w: 34, h: 23.84 },
    barrelView: { x: -1, y: -4, w: 26, h: 8 },
    refW: 34, barrelRefW: 48,
  },
};

interface TankImages {
  body: HTMLImageElement;
  barrel: HTMLImageElement;
  ready: boolean;
}
const tankImgs: Record<string, TankImages> = {};
const loadPromises: Promise<unknown>[] = [];

for (const [key, meta] of Object.entries(TANK_SPRITES)) {
  const body = new Image();
  body.src = meta.bodyUrl;
  const barrel = new Image();
  barrel.src = meta.barrelUrl;
  const entry: TankImages = { body, barrel, ready: false };
  tankImgs[key] = entry;
  loadPromises.push(
    Promise.all([body.decode().catch(() => {}), barrel.decode().catch(() => {})])
      .then(() => { entry.ready = true; }),
  );
}

function tankKeyFor(body: BodyStyle, turret: TurretStyle, primaryHex: string): string {
  const p = primaryHex.replace("#", "").toLowerCase();
  return `${body}:${turret}:${p}`;
}

/** True when a painted sprite exists for this preset signature. */
export function hasTankSprite(
  body: BodyStyle, turret: TurretStyle, primaryHex: string,
): boolean {
  return tankImgs[tankKeyFor(body, turret, primaryHex)]?.ready === true;
}

/**
 * Draw the body+turret sprite that matches the given preset signature.
 * Position so the hull's top-left lands at (`x`, `hullTop`) and the
 * hull spans width `W`. Returns false if no SVG matches the signature
 * yet — caller should fall back to canvas.
 */
export function drawTankSprite(
  ctx: CanvasRenderingContext2D,
  body: BodyStyle, turret: TurretStyle, primaryHex: string,
  x: number, hullTop: number, W: number,
): boolean {
  const key = tankKeyFor(body, turret, primaryHex);
  const entry = tankImgs[key];
  const meta = TANK_SPRITES[key];
  if (!entry?.ready || !meta) return false;
  const scale = W / meta.refW;
  ctx.drawImage(
    entry.body,
    x + meta.bodyView.x * scale,
    hullTop + meta.bodyView.y * scale,
    meta.bodyView.w * scale,
    meta.bodyView.h * scale,
  );
  return true;
}

/**
 * Draw the matching barrel sprite for a tank preset. Pivot lands at
 * (`bX`, `bY`). `W` is the hull width — barrels were authored at
 * refW=48, so the scale is W/48.
 */
export function drawTankBarrelSprite(
  ctx: CanvasRenderingContext2D,
  body: BodyStyle, turret: TurretStyle, primaryHex: string,
  bX: number, bY: number, W: number,
): boolean {
  const key = tankKeyFor(body, turret, primaryHex);
  const entry = tankImgs[key];
  const meta = TANK_SPRITES[key];
  if (!entry?.ready || !meta) return false;
  const scale = W / meta.barrelRefW;
  ctx.drawImage(
    entry.barrel,
    bX + meta.barrelView.x * scale,
    bY + meta.barrelView.y * scale,
    meta.barrelView.w * scale,
    meta.barrelView.h * scale,
  );
  return true;
}

// ─────────── Decals ───────────

const DECAL_URLS: Partial<Record<DecalStyle, string>> = {
  star: decalStarUrl,
  skull: decalSkullUrl,
  crosshair: decalCrosshairUrl,
  cross: decalCrossUrl,
  flame: decalFlameUrl,
  shield: decalShieldUrl,
};

const decalImgs: Partial<Record<DecalStyle, HTMLImageElement>> = {};
const decalReady: Partial<Record<DecalStyle, boolean>> = {};
const decalLoadPromises: Promise<unknown>[] = [];

for (const [style, url] of Object.entries(DECAL_URLS) as [DecalStyle, string][]) {
  const img = new Image();
  img.src = url;
  decalImgs[style] = img;
  decalLoadPromises.push(
    img.decode().catch(() => {}).then(() => {
      decalReady[style] = true;
    }),
  );
}

/**
 * Draw a decal sprite centered at (`dcx`, `dcy`) sized to `dSize`.
 * Decal SVGs use viewBox "-1 -1 2 2" so the natural sprite is 2×2; we
 * scale to dSize and offset to center on the anchor.
 */
export function drawDecalSprite(
  ctx: CanvasRenderingContext2D,
  decal: DecalStyle,
  dcx: number, dcy: number, dSize: number,
): boolean {
  const img = decalImgs[decal];
  if (!img || !decalReady[decal]) return false;
  ctx.drawImage(img, dcx - dSize / 2, dcy - dSize / 2, dSize, dSize);
  return true;
}

// ─────────── Boot-time preload ───────────

/** Resolves once every painted sprite is decoded and ready for sync use. */
export const SPRITES_READY: Promise<unknown> = Promise.all([
  ...loadPromises,
  ...decalLoadPromises,
]);
