export type ItemId = "jetpack" | "teleport" | "shield" | "repair";

export interface ItemDef {
  id: ItemId;
  name: string;
  /** short description for the tile tooltip */
  blurb: string;
  /** charges per match */
  maxCharges: number;
  /** UI tile color */
  tint: number;
  /** glyph used by the UI tile when no SVG is available */
  glyph: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  jetpack: {
    id: "jetpack",
    name: "Jetpack",
    blurb: "Click to choose a landing spot within range. Ends your turn.",
    maxCharges: 2,
    tint: 0x7ed8ff,
    glyph: "↟",
  },
  teleport: {
    id: "teleport",
    name: "Teleport",
    blurb: "Warp to a random spot on the map. Ends your turn.",
    maxCharges: 1,
    tint: 0xc78bff,
    glyph: "✦",
  },
  shield: {
    id: "shield",
    name: "Shield",
    blurb: "Halve incoming damage until your next turn. Ends your turn.",
    maxCharges: 1,
    tint: 0xffd25e,
    glyph: "◈",
  },
  repair: {
    id: "repair",
    name: "Repair Kit",
    blurb: "Restore 35 HP (up to your starting cap). Ends your turn.",
    maxCharges: 2,
    tint: 0x6effa1,
    glyph: "+",
  },
};

export const DEFAULT_ITEMS: ItemId[] = ["jetpack", "teleport", "shield", "repair"];

/** Server-side tunables for item effects. Centralized so client/UX can show
 *  matching numbers in the blurb without drift. */
export const ITEM_TUNING = {
  /** Max distance the player can pick for the jetpack landing spot. */
  jetpack: { maxRange: 320 },
  teleport: { minDelta: 280 },
  shield: { durationMs: 30_000, multiplier: 0.5 },
  repair: { hpRestore: 35 },
} as const;

/** Items that require the client to provide target coordinates when used. */
export const TARGETED_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(["jetpack"]);
