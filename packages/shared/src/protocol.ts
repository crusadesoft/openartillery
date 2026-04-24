/**
 * Wire-level constants shared by client and server so we never have magic
 * strings for room join options or reconnection state.
 */

export const ROOM_OPTIONS_KEYS = {
  MODE: "mode",
  USERNAME: "username",
  ACCESS_TOKEN: "accessToken",
  INVITE_CODE: "inviteCode",
  RECONNECTION_TOKEN: "reconnectionToken",
} as const;

/** Colyseus `joinOrCreate` / `joinById` options payload. */
export interface RoomJoinOptions {
  mode: string;
  username: string;
  accessToken?: string;
  inviteCode?: string;
  botCount?: number;
  botDifficulty?: string;
  biome?: string;
  /** Only read on create: caps the lobby size for custom / private / bots. */
  maxPlayers?: number;
  /** Only read on create: host-supplied lobby name for the browser. */
  lobbyName?: string;
  /** Only read on create: whether the lobby is listed publicly. */
  visibility?: "public" | "private";
  /** Optional password for private rooms; required on join if host set one. */
  password?: string;
  loadout?: {
    body: string;
    turret: string;
    barrel: string;
    primaryColor: number;
    accentColor: number;
  };
}

export const RECONNECT_GRACE_MS = 20_000;
export const MESSAGE_RATE_LIMIT = {
  /** max messages per rolling window */
  COUNT: 40,
  WINDOW_MS: 1000,
} as const;

export const CHAT_RATE_LIMIT = {
  COUNT: 4,
  WINDOW_MS: 5_000,
} as const;
