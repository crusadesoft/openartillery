import {
  ROOM_OPTIONS_KEYS,
  WORLD,
  type LoadoutSelection,
  type RoomJoinOptions,
} from "@artillery/shared";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../auth/jwt.js";
import { db, schema } from "../db/index.js";
import { getOwnedTankSkus, loadOwnedSelection } from "../shop/service.js";

export const TANK_COLORS = [
  0xff5e5e, 0x5ecfff, 0x8aff5e, 0xffd25e, 0xcf5eff, 0xff9d5e,
  0x5efff6, 0xff5ec8,
];

/** Per-team palettes. Each palette must hold ≥ the largest supported
 *  team size (4) so a fully-stacked team has unique tank colors. Hues
 *  are kept far apart between teams so the battlefield reads at a
 *  glance even at 2v2v2v2. */
export const TEAM_A_COLORS = [0xff5e5e, 0xff7a5e, 0xff9d5e, 0xffb55e]; // warm reds/oranges
export const TEAM_B_COLORS = [0x5ecfff, 0x5e9dff, 0x80c0ff, 0x5efff6]; // cool blues
export const TEAM_C_COLORS = [0x8aff5e, 0x5eff8a, 0xb0ff80, 0x5edd5e]; // greens
export const TEAM_D_COLORS = [0xcf5eff, 0xff5ec8, 0xa080ff, 0xff80e0]; // purples / magenta

export const TEAM_PALETTES = [
  TANK_COLORS,
  TEAM_A_COLORS,
  TEAM_B_COLORS,
  TEAM_C_COLORS,
  TEAM_D_COLORS,
] as const;

export const BOT_NAMES = [
  "xXxSn1per420xXx",
  "ur_mom_2007",
  "MLG_PRO_99",
  "n00bSlayer69",
  "TankYouVeryMuch",
  "xX_LegoLas_Xx",
  "MountainDewey",
  "DoritoDuster",
  "GitGudScrub",
  "QuickScopeJesus",
  "SwagOnMyTreads",
  "trickshot_chad",
  "EzClapKid",
  "noscope_god",
  "FaZe_ToiletPaper",
  "OpticGravy",
  "shrek_is_love",
  "TheRealBoomer",
  "yeezy_tank_69",
  "TankSinatra",
  "BarrelHugger",
  "ImYourDad",
  "xXBigChungusXx",
  "MarioKartMain",
  "SoggyNuggets",
  "TacticalNukeDad",
  "PrestigeMaster",
  "DangleSauce",
  "xx_SpicyMayo_xx",
  "Steve_Minecraft",
  "RPG_Whisperer",
  "QuickMaffs",
  "n0_lifer_2008",
  "TankGodFrFr",
  "1v1MeRusty",
  "Dave_From_Sales",
  "MidwitMike",
  "WiFi_Warrior",
  "yourdadleft",
  "Commander_Uno",
  "CovfefeCommando",
  "shotgun_sherman",
  "ColonelMustard",
  "GeneralProtest",
  "BigT_ThatsMe",
  "NotABotISwear",
  "Toaster_Bath",
  "TubGoblin",
  "RamenLord",
  "NerfThis",
  "moist_breadstick",
  "TankSpongeBob",
  "DiarrheaDave",
  "GokuOnSteroids",
  "PudgeFingers",
  "SkywalkerStank",
  "PrincessLayla",
  "BatmanWasHere",
  "ChuckNorrisJr",
  "ImSorryGandhi",
  "GandalfTheBeige",
  "HairyPotter",
  "ObiWanKablooey",
  "VoldemortSmurf",
  "InspectorGadgetz",
  "SonicTheBoom",
  "MarioStuntDouble",
  "PikachooseMe",
  "DonkeyKong64Life",
  "ButterFingrz",
  "Pickle_Wizard",
  "Cereal_Killer",
  "FartKnight",
  "ThiccBoiTank",
  "Lord_Farquaad",
  "DwightFromSales",
  "MichaelScarn",
  "PamBeezly",
  "DundlerMifflin",
  "RegionalManager",
  "Tank_McTankFace",
  "HollaBackTank",
  "BoutToTaco",
  "QueenLatifa",
  "ScaryTerry",
  "JebBush2016",
  "RonSwansonBacon",
  "Hodor_Hodor",
  "DragonbornDad",
  "FusRoDan",
  "DovahkiinTank",
  "ChampionOfWalmart",
  "Aragorn_Jr",
  "GlitterBomber",
  "BootyHaver",
];

/** Pick a bot name not already in use within this match. Falls back to
 *  appending a numeric suffix if the pool is exhausted (lobby has more
 *  bots than unique names). */
export function pickBotName(takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  if (free.length > 0) {
    return free[Math.floor(Math.random() * free.length)]!;
  }
  const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function rollWind(maxWind: number = WORLD.MAX_WIND): number {
  return (Math.random() * 2 - 1) * maxWind;
}

export function rateAllow(bucket: number[], count: number, windowMs: number): boolean {
  const now = Date.now();
  while (bucket.length && now - bucket[0]! > windowMs) bucket.shift();
  if (bucket.length >= count) return false;
  bucket.push(now);
  return true;
}

export function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function sanitizeLobbyName(raw: unknown, fallbackOwner: unknown): string {
  const s = typeof raw === "string" ? raw.trim().slice(0, 32) : "";
  if (s) return s;
  const owner = typeof fallbackOwner === "string" ? fallbackOwner.trim().slice(0, 16) : "";
  return owner ? `${owner}'s lobby` : "Lobby";
}

export async function resolveIdentity(
  options: RoomJoinOptions,
): Promise<{
  userId: string;
  username: string;
  mmr: number;
  selection?: LoadoutSelection;
  ownedSkus: ReadonlySet<string>;
} | null> {
  const token = options[ROOM_OPTIONS_KEYS.ACCESS_TOKEN as "accessToken"];
  if (!token) return null;
  try {
    const claims = await verifyAccessToken(token);
    const row = await db.query.users.findFirst({
      where: eq(schema.users.id, claims.sub),
    });
    if (!row) return null;
    const [{ selection }, ownedSkus] = await Promise.all([
      loadOwnedSelection(row.id),
      getOwnedTankSkus(row.id),
    ]);
    return {
      userId: row.id,
      username: row.username,
      mmr: row.mmr,
      selection,
      ownedSkus,
    };
  } catch {
    return null;
  }
}
