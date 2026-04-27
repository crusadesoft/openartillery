import type {
  BarrelStyle,
  BodyStyle,
  DecalStyle,
  Loadout,
  PatternStyle,
  TurretStyle,
} from "./loadout.js";

/**
 * Tanks are atomic kits: hull, turret, barrel, pattern, and a fixed paint
 * job ship together. Customers cannot mix-and-match parts across kits.
 * Decals are independent — bought tanks each unlock one bonus decal that
 * the player may pin on any owned tank.
 */
export interface TankSpec {
  sku: string;
  label: string;
  blurb: string;
  /** 0 cents = free starter tank. */
  priceCents: number;
  body: BodyStyle;
  turret: TurretStyle;
  barrel: BarrelStyle;
  pattern: PatternStyle;
  primaryColor: number;
  accentColor: number;
  patternColor: number;
  /** Decals granted to the player's pool when this tank is owned. */
  bonusDecals: readonly DecalStyle[];
}

export const FREE_DECALS: readonly DecalStyle[] = ["none", "cross"];

export const TANKS: readonly TankSpec[] = [
  // ── Free starter tanks ─────────────────────────────────────────────
  {
    sku: "standard",
    label: "Standard",
    blurb: "Field-drab heavy hull, round turret, standard tube. Service issue.",
    priceCents: 0,
    body: "heavy",
    turret: "standard",
    barrel: "standard",
    pattern: "solid",
    primaryColor: 0x3a4a22,
    accentColor: 0x8a6a1a,
    patternColor: 0x2e3a18,
    bonusDecals: [],
  },
  {
    sku: "light_recon",
    label: "Light Recon",
    blurb: "Slate-grey light chassis, dome turret, long barrel. Pixel camo.",
    priceCents: 0,
    body: "light",
    turret: "dome",
    barrel: "long",
    pattern: "digital",
    primaryColor: 0x4a5560,
    accentColor: 0x202830,
    patternColor: 0x2e3640,
    bonusDecals: [],
  },
  {
    sku: "scout",
    label: "Scout",
    blurb: "Olive scout chassis, box turret, stubby tube. Disruption stripes.",
    priceCents: 0,
    body: "scout",
    turret: "box",
    barrel: "stubby",
    pattern: "stripes",
    primaryColor: 0x4a5520,
    accentColor: 0x6e6a35,
    patternColor: 0x2e3a14,
    bonusDecals: [],
  },

  // ── Paid tanks ($0.99 each) ────────────────────────────────────────
  {
    sku: "desert_recon",
    label: "Desert Recon",
    blurb: "Sand-theatre kit. Long-glass optics, chevron camo, range-card reticle.",
    priceCents: 99,
    body: "assault",
    turret: "angular",
    barrel: "heavy",
    pattern: "chevron",
    primaryColor: 0xc9a978,
    accentColor: 0x4a3520,
    patternColor: 0x8a6a3d,
    bonusDecals: ["crosshair"],
  },
  {
    sku: "arctic_wolf",
    label: "Arctic Wolf",
    blurb: "Siege loadout for cold-front engagements. Splinter camo, heraldic shield.",
    priceCents: 99,
    body: "siege",
    turret: "wedge",
    barrel: "sniper",
    pattern: "splinter",
    primaryColor: 0xdce4ec,
    accentColor: 0x1f2b3a,
    patternColor: 0x6e7e90,
    bonusDecals: ["shield"],
  },
  {
    sku: "jungle_strike",
    label: "Jungle Strike",
    blurb: "Bunker chassis with mortar tube. Tiger stripe and burning-spear insignia.",
    priceCents: 99,
    body: "bunker",
    turret: "low",
    barrel: "mortar",
    pattern: "tiger",
    primaryColor: 0x3a4a22,
    accentColor: 0x6b3d1a,
    patternColor: 0x1f2a14,
    bonusDecals: ["flame"],
  },
  {
    sku: "black_ops",
    label: "Black-Ops",
    blurb: "Stealth recon hull, tower-profile turret, rail accelerator. Jolly roger.",
    priceCents: 99,
    body: "recon",
    turret: "tall",
    barrel: "rail",
    pattern: "urban",
    primaryColor: 0x1a1a1c,
    accentColor: 0x8a1a1a,
    patternColor: 0x2e2e30,
    bonusDecals: ["skull"],
  },
  {
    sku: "urban_hex",
    label: "Urban Hex",
    blurb: "Speeder chassis, twin-mount turret + dual barrel. Hex camo, allied star.",
    priceCents: 99,
    body: "speeder",
    turret: "twin",
    barrel: "twin",
    pattern: "hex",
    primaryColor: 0x6a6e72,
    accentColor: 0xd4a44c,
    patternColor: 0x3e4146,
    bonusDecals: ["star"],
  },
] as const;

export const ALL_TANK_SKUS: readonly string[] = TANKS.map((t) => t.sku);
export const PAID_TANK_SKUS: readonly string[] = TANKS.filter(
  (t) => t.priceCents > 0,
).map((t) => t.sku);

export const DEFAULT_TANK_SKU = "standard";

export interface LoadoutSelection {
  tankSku: string;
  decal: DecalStyle;
}

export const DEFAULT_SELECTION: LoadoutSelection = {
  tankSku: DEFAULT_TANK_SKU,
  decal: "none",
};

export function tankBySku(sku: string): TankSpec | undefined {
  return TANKS.find((t) => t.sku === sku);
}

export function isTankSku(sku: string): boolean {
  return TANKS.some((t) => t.sku === sku);
}

export function isPaidTankSku(sku: string): boolean {
  const t = tankBySku(sku);
  return !!t && t.priceCents > 0;
}

export function isFreeDecal(d: string): boolean {
  return (FREE_DECALS as readonly string[]).includes(d);
}

/**
 * True when the player has access to the tank — either it's a free starter
 * or they hold an entitlement for it.
 */
export function isOwnedTank(
  sku: string,
  ownedSkus: ReadonlySet<string>,
): boolean {
  const t = tankBySku(sku);
  if (!t) return false;
  if (t.priceCents === 0) return true;
  return ownedSkus.has(sku);
}

/**
 * Decals the player may equip: free decals + the union of bonus decals
 * granted by every owned tank.
 */
export function decalsAvailable(
  ownedTankSkus: ReadonlySet<string>,
): Set<DecalStyle> {
  const out = new Set<DecalStyle>(FREE_DECALS);
  for (const sku of ownedTankSkus) {
    const t = tankBySku(sku);
    if (!t) continue;
    for (const d of t.bonusDecals) out.add(d);
  }
  return out;
}

export function sanitizeSelection(
  x: Partial<LoadoutSelection> | undefined | null,
): LoadoutSelection {
  const o = x ?? {};
  const sku =
    typeof o.tankSku === "string" && isTankSku(o.tankSku)
      ? o.tankSku
      : DEFAULT_TANK_SKU;
  const decal = typeof o.decal === "string" ? (o.decal as DecalStyle) : "none";
  return { tankSku: sku, decal };
}

/**
 * Drops any selection the player can't actually equip back to safe
 * defaults. Used both client-side (to keep the UI in a valid state) and
 * server-side at match start (so an out-of-date client can't show a
 * skin it didn't pay for).
 */
export function downgradeSelection(
  sel: LoadoutSelection,
  ownedTankSkus: ReadonlySet<string>,
): LoadoutSelection {
  const tankSku = isOwnedTank(sel.tankSku, ownedTankSkus)
    ? sel.tankSku
    : DEFAULT_TANK_SKU;
  const allowed = decalsAvailable(ownedTankSkus);
  const decal: DecalStyle = allowed.has(sel.decal) ? sel.decal : "none";
  return { tankSku, decal };
}

export function resolveSelection(sel: LoadoutSelection): Loadout {
  const t = tankBySku(sel.tankSku) ?? tankBySku(DEFAULT_TANK_SKU)!;
  return {
    body: t.body,
    turret: t.turret,
    barrel: t.barrel,
    pattern: t.pattern,
    decal: sel.decal,
    primaryColor: t.primaryColor,
    accentColor: t.accentColor,
    patternColor: t.patternColor,
  };
}
