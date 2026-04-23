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
    const list = await (
      c as unknown as {
        getAvailableRooms: (
          name: string,
        ) => Promise<Array<{ roomId: string; metadata?: { inviteCode?: string } }>>;
      }
    ).getAvailableRooms("battle");
    const target = list.find((r) => r.metadata?.inviteCode === opts.inviteCode);
    if (target) {
      room = await c.joinById<BattleState>(target.roomId, joinOptions);
    } else {
      room = await c.create<BattleState>("battle", {
        ...joinOptions,
        mode: "private",
      });
    }
  } else if (opts.mode === "bots" || opts.mode === "private") {
    // Always create a fresh room for these — no matchmaking join.
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
