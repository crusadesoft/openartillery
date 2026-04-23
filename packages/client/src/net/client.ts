import { Client, Room } from "colyseus.js";
import { BattleState, type RoomJoinOptions } from "@artillery/shared";
import { authStorage } from "../auth/authClient";
import { loadLoadout } from "../game/loadoutStorage";

function endpoint(): string {
  const isSecure = location.protocol === "https:";
  const proto = isSecure ? "wss" : "ws";
  const host = location.hostname;
  const port =
    location.port === "5173" || location.port === ""
      ? 2567
      : Number(location.port);
  return `${proto}://${host}:${port}`;
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

export async function joinBattle(opts: {
  mode: string;
  username: string;
  inviteCode?: string;
  botCount?: number;
  botDifficulty?: string;
  biome?: string;
}): Promise<Room<BattleState>> {
  const c = getClient();
  const session = authStorage.load();
  const loadout = loadLoadout();
  const joinOptions: RoomJoinOptions = {
    mode: opts.mode,
    username: opts.username,
    loadout,
    ...(opts.inviteCode ? { inviteCode: opts.inviteCode } : {}),
    ...(opts.botCount != null ? { botCount: opts.botCount } : {}),
    ...(opts.botDifficulty ? { botDifficulty: opts.botDifficulty } : {}),
    ...(opts.biome ? { biome: opts.biome } : {}),
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
  if (opts.inviteCode) {
    // Colyseus matchmaker filters rooms by `mode` + `inviteCode`
    // (see server/src/index.ts `filterBy(["mode","inviteCode"])`), so
    // `join` will locate the host's existing private room. If no room
    // matches we throw a clearer error than the server's default so
    // the UI can show "Invalid invite code" instead of a raw matchmake
    // message.
    try {
      room = await c.join<BattleState>("battle", {
        ...joinOptions,
        mode: "private",
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (/no rooms/i.test(msg) || /matchmake/i.test(msg)) {
        throw new Error(`No match found for invite code "${opts.inviteCode}"`);
      }
      throw err;
    }
  } else if (opts.mode === "private") {
    // Generate the invite code client-side and pass it through `create`
    // options so the matchmaker's `filterBy(["mode","inviteCode"])`
    // indexes this room by that exact code. Without this, filterBy
    // sees `inviteCode: undefined` and no guest can ever find us.
    const generatedCode = randomInviteCode();
    room = await c.create<BattleState>("battle", {
      ...joinOptions,
      inviteCode: generatedCode,
    });
  } else if (opts.mode === "bots") {
    // Always a fresh room — no matchmaking join.
    room = await c.create<BattleState>("battle", joinOptions);
  } else {
    room = await c.joinOrCreate<BattleState>("battle", joinOptions);
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
