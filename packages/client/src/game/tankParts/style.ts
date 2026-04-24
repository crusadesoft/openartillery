export type BodyStyle =
  | "heavy" | "light" | "assault" | "scout" | "siege"
  | "bunker" | "recon" | "speeder";
export type TurretStyle =
  | "standard" | "angular" | "low" | "wedge" | "dome"
  | "box" | "tall" | "twin";
export type BarrelStyle =
  | "standard" | "heavy" | "long" | "sniper" | "stubby"
  | "mortar" | "twin" | "rail";
export type PatternStyle =
  | "solid" | "stripes" | "tiger" | "digital" | "chevron"
  | "splinter" | "urban" | "hex";
export type DecalStyle =
  | "none" | "number" | "star" | "skull" | "crosshair"
  | "cross" | "flame" | "shield";

/** Canonical proportion maps — shared with the in-game textures so the
 *  silhouette is identical. */
export const hullFracMap: Record<BodyStyle, number> = {
  heavy: 0.34, light: 0.30, assault: 0.26, scout: 0.28, siege: 0.38,
  bunker: 0.42, recon: 0.30, speeder: 0.26,
};
export const turretWMap: Record<TurretStyle, number> = {
  standard: 0.34, angular: 0.36, low: 0.42, wedge: 0.38, dome: 0.32,
  box: 0.36, tall: 0.28, twin: 0.40,
};
export const turretHMap: Record<TurretStyle, number> = {
  standard: 0.22, angular: 0.20, low: 0.14, wedge: 0.22, dome: 0.28,
  box: 0.24, tall: 0.32, twin: 0.22,
};
export const barrelLenMap: Record<BarrelStyle, number> = {
  standard: 0.46, heavy: 0.42, long: 0.58, sniper: 0.66, stubby: 0.32,
  mortar: 0.22, twin: 0.50, rail: 0.72,
};
export const barrelThickMap: Record<BarrelStyle, number> = {
  standard: 0.05, heavy: 0.065, long: 0.05, sniper: 0.038, stubby: 0.085,
  mortar: 0.11, twin: 0.06, rail: 0.032,
};

/** Reference width used when the in-game barrel sprite is baked on its
 *  own canvas. */
export const BARREL_REF_W = 48;

/** Canonical in-world hull width per body style (pixels). */
export const HULL_WIDTHS: Record<BodyStyle, number> = {
  heavy: 48, light: 40, assault: 50, scout: 36, siege: 54,
  bunker: 46, recon: 42, speeder: 34,
};

export function shadeHex(hex: string, f: number): string {
  const c = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(0, 2), 16) * f)));
  const g = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(2, 4), 16) * f)));
  const b = Math.min(255, Math.max(0, Math.floor(parseInt(c.slice(4, 6), 16) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
