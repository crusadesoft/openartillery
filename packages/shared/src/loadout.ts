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
  | "none" | "star" | "skull" | "crosshair"
  | "cross" | "flame" | "shield";

export interface Loadout {
  body: BodyStyle;
  turret: TurretStyle;
  barrel: BarrelStyle;
  pattern: PatternStyle;
  decal: DecalStyle;
  primaryColor: number;
  accentColor: number;
  patternColor: number;
}

export const DEFAULT_LOADOUT_SPEC: Loadout = {
  body: "heavy",
  turret: "standard",
  barrel: "standard",
  pattern: "solid",
  decal: "none",
  primaryColor: 0x3a2e1b,
  accentColor: 0xb28a3d,
  patternColor: 0x1a140c,
};

export const ALL_BODIES: BodyStyle[] = [
  "heavy", "light", "assault", "scout", "siege",
  "bunker", "recon", "speeder",
];
export const ALL_TURRETS: TurretStyle[] = [
  "standard", "angular", "low", "wedge", "dome",
  "box", "tall", "twin",
];
export const ALL_BARRELS: BarrelStyle[] = [
  "standard", "heavy", "long", "sniper", "stubby",
  "mortar", "twin", "rail",
];
export const ALL_PATTERNS: PatternStyle[] = [
  "solid", "stripes", "tiger", "digital", "chevron",
  "splinter", "urban", "hex",
];
export const ALL_DECALS: DecalStyle[] = [
  "none", "star", "skull", "crosshair",
  "cross", "flame", "shield",
];

export interface PartDescriptor<T extends string> {
  id: T;
  label: string;
  blurb: string;
}

export const BODY_DESCRIPTORS: Record<BodyStyle, PartDescriptor<BodyStyle>> = {
  heavy:   { id: "heavy",   label: "Heavy",   blurb: "Wide hull, six road wheels, sloped glacis." },
  light:   { id: "light",   label: "Light",   blurb: "Angled glacis, narrow profile, four wheels — nimble." },
  assault: { id: "assault", label: "Assault", blurb: "Low-slung hull with full-length track skirts." },
  scout:   { id: "scout",   label: "Scout",   blurb: "Stripped-down recon chassis. Small, fast, exposed." },
  siege:   { id: "siege",   label: "Siege",   blurb: "Seven-wheel heavy-assault hull with maximum frontal armour." },
  bunker:  { id: "bunker",  label: "Bunker",  blurb: "Squat fortress chassis — thick plate, minimal slope." },
  recon:   { id: "recon",   label: "Recon",   blurb: "Wedge-nosed spotter hull with an extreme glacis angle." },
  speeder: { id: "speeder", label: "Speeder", blurb: "Tiny-footprint racer hull. All attitude, no armour." },
};

export const TURRET_DESCRIPTORS: Record<TurretStyle, PartDescriptor<TurretStyle>> = {
  standard: { id: "standard", label: "Round",       blurb: "Classic hemispheric turret." },
  angular:  { id: "angular",  label: "Angular",     blurb: "Faceted / hexagonal. Modernist." },
  low:      { id: "low",      label: "Low-profile", blurb: "Short, wide squash dome." },
  wedge:    { id: "wedge",    label: "Wedge",       blurb: "Sloped wedge-profile turret. Deflects the eye." },
  dome:     { id: "dome",     label: "Dome",        blurb: "Tall round dome with a raised cupola." },
  box:      { id: "box",      label: "Box",         blurb: "Brutalist rectangular casemate turret." },
  tall:     { id: "tall",     label: "Tall",        blurb: "Tower-profile turret with bolt tiers." },
  twin:     { id: "twin",     label: "Twin Mount",  blurb: "Primary dome with a visible secondary cannon." },
};

export const BARREL_DESCRIPTORS: Record<BarrelStyle, PartDescriptor<BarrelStyle>> = {
  standard: { id: "standard", label: "Standard", blurb: "Default artillery tube." },
  heavy:    { id: "heavy",    label: "Heavy",    blurb: "Thicker barrel. Bigger muzzle brake." },
  long:     { id: "long",     label: "Long",     blurb: "Extended-length barrel. More reach." },
  sniper:   { id: "sniper",   label: "Sniper",   blurb: "Extra-long, pencil-thin precision tube." },
  stubby:   { id: "stubby",   label: "Stubby",   blurb: "Short, wide howitzer-grade launcher." },
  mortar:   { id: "mortar",   label: "Mortar",   blurb: "Very short, very wide bore. Indirect feel." },
  twin:     { id: "twin",     label: "Twin",     blurb: "Side-by-side dual barrels." },
  rail:     { id: "rail",     label: "Rail",     blurb: "Hyper-long, hyper-thin rail accelerator." },
};

export const PATTERN_DESCRIPTORS: Record<PatternStyle, PartDescriptor<PatternStyle>> = {
  solid:    { id: "solid",    label: "Solid",    blurb: "Clean single-tone hull." },
  stripes:  { id: "stripes",  label: "Stripes",  blurb: "Horizontal disruption stripes." },
  tiger:    { id: "tiger",    label: "Tiger",    blurb: "Vertical tiger stripe camo." },
  digital:  { id: "digital",  label: "Digital",  blurb: "Pixelated urban pattern." },
  chevron:  { id: "chevron",  label: "Chevron",  blurb: "Forward-pointing chevrons." },
  splinter: { id: "splinter", label: "Splinter", blurb: "Angular shards — German splinter camo." },
  urban:    { id: "urban",    label: "Urban",    blurb: "Rectangular block camo for city fighting." },
  hex:      { id: "hex",      label: "Hex",      blurb: "Hexagonal tiled cells, modern kit." },
};

export const DECAL_DESCRIPTORS: Record<DecalStyle, PartDescriptor<DecalStyle>> = {
  none:      { id: "none",      label: "None",      blurb: "Clean hull. No markings." },
  star:      { id: "star",      label: "Star",      blurb: "Allied white star." },
  skull:     { id: "skull",     label: "Skull",     blurb: "Jolly roger. Intimidation factor." },
  crosshair: { id: "crosshair", label: "Reticle",   blurb: "Tactical reticle stencil." },
  cross:     { id: "cross",     label: "Cross",     blurb: "Catholic cross. Pro patria et fide." },
  flame:     { id: "flame",     label: "Flame",     blurb: "Stylised flame silhouette." },
  shield:    { id: "shield",    label: "Shield",    blurb: "Heraldic shield outline." },
};

export const PALETTE_PRIMARY: number[] = [
  0x3a2e1b, // field drab
  0x4a3d28, // dark khaki
  0x2e3a22, // woodland green
  0x1f2b1a, // deep olive
  0x2c2823, // gun metal
  0x38363a, // slate graphite
  0x5a2a1e, // burnt rust
  0x6b3d1a, // dark tan
  0x1a2430, // steel blue-black
  0x211515, // pitch
  0x5a5a2a, // desert yellow
  0x2a3a4a, // naval blue
  0x4a3030, // oxblood
  0x302820, // cocoa bark
];

export const PALETTE_ACCENT: number[] = [
  0xb28a3d, // brass
  0x8a6a1a, // dull gold
  0x6a2820, // blood red
  0x203040, // gunmetal
  0xb7a78a, // weathered bone
  0x3a2010, // deep rust
  0x2e3a22, // olive stripe
  0x5a5a55, // steel
  0xd4a44c, // bright brass
  0x3a3a3a, // tar black
];

export function isValidLoadout(x: unknown): x is Loadout {
  if (!x || typeof x !== "object") return false;
  const o = x as Loadout;
  return (
    ALL_BODIES.includes(o.body as BodyStyle) &&
    ALL_TURRETS.includes(o.turret as TurretStyle) &&
    ALL_BARRELS.includes(o.barrel as BarrelStyle) &&
    typeof o.primaryColor === "number" &&
    typeof o.accentColor === "number"
  );
}

export function sanitizeLoadout(x: Partial<Loadout> | undefined | null): Loadout {
  const o = x ?? {};
  return {
    body: (ALL_BODIES.includes(o.body as BodyStyle) ? o.body : "heavy") as BodyStyle,
    turret: (ALL_TURRETS.includes(o.turret as TurretStyle) ? o.turret : "standard") as TurretStyle,
    barrel: (ALL_BARRELS.includes(o.barrel as BarrelStyle) ? o.barrel : "standard") as BarrelStyle,
    pattern: (ALL_PATTERNS.includes(o.pattern as PatternStyle) ? o.pattern : "solid") as PatternStyle,
    decal: (ALL_DECALS.includes(o.decal as DecalStyle) ? o.decal : "none") as DecalStyle,
    primaryColor: typeof o.primaryColor === "number" ? (o.primaryColor & 0xffffff) : DEFAULT_LOADOUT_SPEC.primaryColor,
    accentColor: typeof o.accentColor === "number" ? (o.accentColor & 0xffffff) : DEFAULT_LOADOUT_SPEC.accentColor,
    patternColor: typeof o.patternColor === "number" ? (o.patternColor & 0xffffff) : DEFAULT_LOADOUT_SPEC.patternColor,
  };
}
