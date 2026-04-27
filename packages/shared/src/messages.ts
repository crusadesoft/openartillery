import type { ItemId } from "./items.js";
import type { WeaponId } from "./weapons.js";

/** Messages sent from client → server. */
export type ClientMessage =
  | { type: "input"; left: boolean; right: boolean; up: boolean; down: boolean }
  | { type: "selectWeapon"; weapon: WeaponId }
  | { type: "aim"; angle: number; power: number; facing?: -1 | 1 }
  | { type: "fire" }
  | { type: "charge"; charging: boolean } // legacy keyboard path
  | { type: "ready"; ready: boolean }
  | { type: "chat"; text: string }
  | { type: "addBot"; difficulty?: string }
  | { type: "removeBot"; sessionId: string }
  | { type: "setBotDifficulty"; sessionId: string; difficulty: string }
  | { type: "setTeam"; sessionId: string; team: number }
  | { type: "shuffleTeams" }
  | {
      type: "setMatchSettings";
      turnDurationSec?: number;
      fuelPerTurn?: number;
      startingHp?: number;
      maxWind?: number;
    }
  | {
      type: "setLobbyConfig";
      lobbyName?: string;
      maxPlayers?: number;
      biome?: string;
      visibility?: "public" | "private";
      password?: string;
      teamMode?: boolean;
      teamCount?: number;
      friendlyFire?: boolean;
      ranked?: boolean;
    };

/** Server → client one-off events (layered on top of schema patches). */
export type ServerEvent =
  | { type: "explosion"; x: number; y: number; radius: number; weapon: WeaponId }
  | {
      type: "fire";
      tankId: string;
      weapon: WeaponId;
      power: number;
      from: { x: number; y: number };
    }
  | { type: "damage"; tankId: string; amount: number; x: number; y: number }
  | {
      type: "kill";
      killerId: string | null;
      killerName: string | null;
      victimId: string;
      victimName: string;
      weapon: WeaponId | null;
    }
  | { type: "death"; tankId: string }
  | { type: "turn"; tankId: string; endsAt: number; turnNumber: number }
  | { type: "gameOver"; winnerId: string | null }
  | { type: "chat"; name: string; text: string; at: number; color?: number }
  | {
      type: "item";
      tankId: string;
      item: ItemId;
      x: number;
      y: number;
      from?: { x: number; y: number };
    };

export const MESSAGE_KINDS = {
  INPUT: "input",
  SELECT_WEAPON: "selectWeapon",
  AIM: "aim",
  FIRE: "fire",
  CHARGE: "charge",
  READY: "ready",
  CHAT: "chat",
  ADD_BOT: "addBot",
  EVENT: "event",
} as const;
