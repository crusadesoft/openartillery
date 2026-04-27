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
  /** Only read on create: ranked match (no bots allowed, ELO applies). */
  ranked?: boolean;
  /** Only read on create: opt-in team mode for custom lobbies. */
  teamMode?: boolean;
  /** Only read on create: number of distinct teams (2..4) in custom team mode. */
  teamCount?: number;
  /** Only read on create: whether allies take splash damage in custom team mode. */
  friendlyFire?: boolean;
  /** Tank + decal selection. Server expands the tank SKU into the
   *  full part/colour set on join. */
  loadout?: {
    tankSku: string;
    decal: string;
  };
}

export const RECONNECT_GRACE_MS = 20_000;
/** Recap window after a match ends: casual rooms reset to the lobby,
 *  ranked clients return to the menu. Shared so the client countdown
 *  can't drift away from the server's timer. */
export const POST_MATCH_RECAP_MS = 7_000;
export const MESSAGE_RATE_LIMIT = {
  /** max messages per rolling window */
  COUNT: 40,
  WINDOW_MS: 1000,
} as const;

export const CHAT_RATE_LIMIT = {
  COUNT: 4,
  WINDOW_MS: 5_000,
} as const;
