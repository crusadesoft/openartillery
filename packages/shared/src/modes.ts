export type GameMode = "ffa" | "duel" | "private" | "bots" | "custom";
export type BotDifficulty = "easy" | "normal" | "hard" | "nightmare";

export interface ModeSpec {
  id: GameMode;
  label: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** fill with bots when queue exceeds this timeout (ms, 0 = never) */
  botFillAfterMs: number;
  /** rated match (affects ELO) */
  ranked: boolean;
  /** spawn this many bots immediately on room creation */
  preloadedBots?: number;
}

export const MODES: Record<GameMode, ModeSpec> = {
  ffa: {
    id: "ffa",
    label: "Free-for-All",
    description: "Up to 6 tanks. Last one standing wins. Ranked.",
    minPlayers: 2,
    maxPlayers: 6,
    botFillAfterMs: 0,
    ranked: true,
  },
  duel: {
    id: "duel",
    label: "Duel",
    description: "Head-to-head. Fills with a bot if queued too long.",
    minPlayers: 2,
    maxPlayers: 2,
    botFillAfterMs: 20_000,
    ranked: true,
  },
  private: {
    id: "private",
    label: "Private Room",
    description: "Invite-code room. Unranked; bring your own rules.",
    minPlayers: 1,
    maxPlayers: 6,
    botFillAfterMs: 0,
    ranked: false,
  },
  bots: {
    id: "bots",
    label: "Practice vs CPU",
    description: "Spawn AI opponents to practice. Unranked.",
    minPlayers: 1,
    maxPlayers: 6,
    botFillAfterMs: 0,
    ranked: false,
    preloadedBots: 2,
  },
  custom: {
    id: "custom",
    label: "Custom Lobby",
    description: "Public custom lobby. Host picks the rules.",
    minPlayers: 2,
    maxPlayers: 8,
    botFillAfterMs: 0,
    ranked: false,
  },
};

export const ALL_MODES: GameMode[] = ["ffa", "duel", "bots", "private", "custom"];

export const BOT_DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard", "nightmare"];

export interface BotDifficultySpec {
  id: BotDifficulty;
  label: string;
  /** degrees of random error applied to aim */
  aimErrorDeg: number;
  /** ± fraction applied to target power */
  powerErrorFrac: number;
  /** preferred weapons (cycled) */
  weaponPool: string[];
  /** base mmr (for display) */
  mmr: number;
}

export const BOT_DIFFICULTY_SPECS: Record<BotDifficulty, BotDifficultySpec> = {
  easy: {
    id: "easy",
    label: "Easy",
    aimErrorDeg: 12,
    powerErrorFrac: 0.2,
    weaponPool: ["shell"],
    mmr: 900,
  },
  normal: {
    id: "normal",
    label: "Normal",
    aimErrorDeg: 6,
    powerErrorFrac: 0.1,
    weaponPool: ["shell", "heavy", "skipper"],
    mmr: 1200,
  },
  hard: {
    id: "hard",
    label: "Hard",
    aimErrorDeg: 2.5,
    powerErrorFrac: 0.04,
    weaponPool: ["shell", "heavy", "cluster", "grenade", "mirv"],
    mmr: 1500,
  },
  nightmare: {
    id: "nightmare",
    label: "Nightmare",
    aimErrorDeg: 0.8,
    powerErrorFrac: 0.02,
    weaponPool: ["heavy", "cluster", "airstrike", "mirv"],
    mmr: 1800,
  },
};

export function isGameMode(x: unknown): x is GameMode {
  return typeof x === "string" && (x as string) in MODES;
}
