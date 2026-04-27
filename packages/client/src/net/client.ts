import { Client, Room } from "colyseus.js";
import { BattleState, type RoomJoinOptions } from "@artillery/shared";
import { authStorage } from "../auth/authClient";
import { loadSelection } from "../game/loadoutStorage";

function endpoint(): string {
  const isSecure = location.protocol === "https:";
  const proto = isSecure ? "wss" : "ws";
  const host = location.hostname;
  // In production the server is fronted by the same origin (port 80/443),
  // so we drop the explicit port. Only Vite dev (5173) needs to reach a
  // different local port — point it at the server's 2567.
  if (location.port === "" || (isSecure && location.port === "443") || (!isSecure && location.port === "80")) {
    return `${proto}://${host}`;
  }
  if (location.port === "5173") {
    return `${proto}://${host}:2567`;
  }
  return `${proto}://${host}:${location.port}`;
}

let client: Client | null = null;
export function getClient(): Client {
  if (!client) client = new Client(endpoint());
  return client;
}

const RECONNECTION_KEY = "artillery:reconnection";

/** 6-char alphanumeric invite code, avoiding visually-confusing chars
 *  like `0/O` and `1/I`. Mirrors the server's generator; generated
 *  client-side so the matchmaker's `filterBy(["mode","inviteCode"])`
 *  can match a guest's join to the host's room on create. */
function randomInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export interface JoinBattleOptions {
  mode: string;
  username: string;
  /** Join a specific room by ID (lobby browser). */
  roomId?: string;
  /** Invite-code join for private lobbies. */
  inviteCode?: string;
  /** Force creation of a new room (Create Lobby form). */
  create?: boolean;
  botCount?: number;
  botDifficulty?: string;
  biome?: string;
  maxPlayers?: number;
  visibility?: "public" | "private";
  lobbyName?: string;
  password?: string;
}

export async function joinBattle(opts: JoinBattleOptions): Promise<Room<BattleState>> {
  const c = getClient();
  const session = authStorage.load();
  const selection = loadSelection();
  const joinOptions: RoomJoinOptions = {
    mode: opts.mode,
    username: opts.username,
    loadout: selection,
    ...(opts.inviteCode ? { inviteCode: opts.inviteCode } : {}),
    ...(opts.botCount != null ? { botCount: opts.botCount } : {}),
    ...(opts.botDifficulty ? { botDifficulty: opts.botDifficulty } : {}),
    ...(opts.biome ? { biome: opts.biome } : {}),
    ...(opts.maxPlayers ? { maxPlayers: opts.maxPlayers } : {}),
    ...(opts.lobbyName ? { lobbyName: opts.lobbyName } : {}),
    ...(opts.password ? { password: opts.password } : {}),
    ...(session ? { accessToken: session.tokens.accessToken } : {}),
  };

  const stashed = localStorage.getItem(RECONNECTION_KEY);
  if (stashed) {
    try {
      const room = await c.reconnect<BattleState>(stashed);
      installRoom(room);
      return room;
    } catch {
      localStorage.removeItem(RECONNECTION_KEY);
    }
  }

  let room: Room<BattleState>;
  if (opts.roomId) {
    try {
      room = await c.joinById<BattleState>(opts.roomId, joinOptions);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (/password/i.test(msg)) {
        throw new Error("This lobby is password-protected. Enter the password and try again.");
      }
      if (/no rooms/i.test(msg) || /locked/i.test(msg) || /full/i.test(msg)) {
        throw new Error("That lobby is no longer available.");
      }
      throw err;
    }
  } else if (opts.inviteCode) {
    // Casual lobbies are all created with mode "custom" and an invite code,
    // so the matchmaker's `filterBy(["mode","inviteCode"])` matches on the
    // code alone. See server/src/index.ts.
    try {
      room = await c.join<BattleState>("battle", {
        ...joinOptions,
        mode: "custom",
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (/password/i.test(msg)) {
        throw new Error("This lobby is password-protected. Enter the password and try again.");
      }
      if (/no rooms/i.test(msg) || /matchmake/i.test(msg)) {
        throw new Error(`No match found for invite code "${opts.inviteCode}"`);
      }
      throw err;
    }
  } else {
    // Every lobby (public or private) gets an invite code so the
    // matchmaker's `filterBy(["mode","inviteCode"])` can index it for
    // later invite-based joins. Generating client-side lets us navigate
    // to the room before the server responds and keeps filterBy honest.
    const inviteCode = randomInviteCode();
    room = await c.create<BattleState>("battle", {
      ...joinOptions,
      mode: opts.mode === "private" || opts.mode === "bots" ? opts.mode : "custom",
      inviteCode,
      ...(opts.visibility ? { visibility: opts.visibility } : {}),
    });
  }

  installRoom(room);
  return room;
}

function installRoom(room: Room<BattleState>): void {
  localStorage.setItem(RECONNECTION_KEY, room.reconnectionToken);
  room.onLeave(() => localStorage.removeItem(RECONNECTION_KEY));
  if (!room.state || !room.state.players) {
    const pending = new Promise<void>((resolve) => {
      room.onStateChange.once(() => resolve());
    });
    (room as unknown as { _firstState: Promise<void> })._firstState = pending;
  }
}

export async function waitForFirstState(room: Room<BattleState>): Promise<void> {
  const pending = (room as unknown as { _firstState?: Promise<void> })._firstState;
  if (pending) await pending;
}
