import { z } from "zod";

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be 3–16 chars")
  .max(16, "Username must be 3–16 chars")
  .regex(/^[A-Za-z0-9_]+$/, "Letters, numbers, underscores only");

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 chars")
  .max(128);

export const RegisterRequest = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RefreshRequest = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PublicProfile {
  id: string;
  username: string;
  mmr: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  matches: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  mmr: number;
  wins: number;
  losses: number;
  kills: number;
  matches: number;
}

export interface LobbySummary {
  roomId: string;
  lobbyName: string;
  hostName: string;
  mode: string;
  biome: string;
  maxPlayers: number;
  currentPlayers: number;
  visibility: "public" | "private";
  ranked: boolean;
  hasBots: boolean;
  createdAt: number;
}

export interface MatchSummary {
  id: string;
  mode: string;
  startedAt: string;
  endedAt: string;
  winnerUsername: string | null;
  participants: {
    username: string;
    placement: number;
    kills: number;
    damage: number;
    mmrDelta: number;
  }[];
}

export const ChatMessage = z.object({
  type: z.literal("chat"),
  text: z.string().min(1).max(140),
});

export const InputMessage = z.object({
  type: z.literal("input"),
  left: z.boolean(),
  right: z.boolean(),
  up: z.boolean(),
  down: z.boolean(),
});

export const SelectWeaponMessage = z.object({
  type: z.literal("selectWeapon"),
  weapon: z.string().min(1).max(24),
});

export const ChargeMessage = z.object({
  type: z.literal("charge"),
  charging: z.boolean(),
});

export const AimMessage = z.object({
  type: z.literal("aim"),
  angle: z.number().min(-90).max(90),
  power: z.number().min(0).max(2200),
  facing: z.union([z.literal(-1), z.literal(1)]).optional(),
});

export const FireMessage = z.object({
  type: z.literal("fire"),
});

export const UseItemMessage = z.object({
  type: z.literal("useItem"),
  item: z.string().min(1).max(24),
  /** target world coords (used by items like jetpack that need a landing spot) */
  targetX: z.number().min(0).max(20000).optional(),
  targetY: z.number().min(-2000).max(20000).optional(),
});

export const ReadyMessage = z.object({
  type: z.literal("ready"),
  ready: z.boolean(),
});

export const AddBotMessage = z.object({
  type: z.literal("addBot"),
  difficulty: z
    .enum(["easy", "normal", "hard", "nightmare"])
    .optional()
    .default("normal"),
});

export const RemoveBotMessage = z.object({
  type: z.literal("removeBot"),
  sessionId: z.string().min(1).max(64),
});

export const SetBotDifficultyMessage = z.object({
  type: z.literal("setBotDifficulty"),
  sessionId: z.string().min(1).max(64),
  difficulty: z.enum(["easy", "normal", "hard", "nightmare"]),
});

export const SetMatchSettingsMessage = z.object({
  type: z.literal("setMatchSettings"),
  turnDurationSec: z.number().int().min(10).max(120).optional(),
  fuelPerTurn: z.number().int().min(0).max(300).optional(),
  startingHp: z.number().int().min(25).max(250).optional(),
  maxWind: z.number().min(0).max(80).optional(),
});

export const SetLobbyConfigMessage = z.object({
  type: z.literal("setLobbyConfig"),
  lobbyName: z.string().max(32).optional(),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  biome: z.string().min(1).max(24).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  /** "" clears the password; otherwise up to 64 chars. */
  password: z.string().max(64).optional(),
  teamMode: z.boolean().optional(),
  teamCount: z.number().int().min(2).max(4).optional(),
  friendlyFire: z.boolean().optional(),
  ranked: z.boolean().optional(),
});

export const SetTeamMessage = z.object({
  type: z.literal("setTeam"),
  sessionId: z.string().min(1).max(64),
  /** 0 = auto/?, 1..4 = explicit team. */
  team: z.number().int().min(0).max(4),
});

export const ShuffleTeamsMessage = z.object({
  type: z.literal("shuffleTeams"),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  InputMessage,
  SelectWeaponMessage,
  AimMessage,
  FireMessage,
  UseItemMessage,
  ChargeMessage,
  ReadyMessage,
  ChatMessage,
  AddBotMessage,
  RemoveBotMessage,
  SetBotDifficultyMessage,
  SetMatchSettingsMessage,
  SetLobbyConfigMessage,
  SetTeamMessage,
  ShuffleTeamsMessage,
]);

export type ValidatedClientMessage = z.infer<typeof ClientMessageSchema>;
