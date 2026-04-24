import type { Client } from "@colyseus/core";
import {
  type BotDifficulty,
  ClientMessageSchema,
  MESSAGE_RATE_LIMIT,
} from "@artillery/shared";
import { logger } from "../logger.js";
import { rateAllow } from "./battleRoomUtils.js";

/** Handler surface the dispatcher requires. BattleRoom implements this
 *  so the dispatcher stays decoupled from Colyseus Room internals and
 *  can be unit-tested with a stub. */
export interface MessageHandlers {
  handleInput: (client: Client, msg: {
    left: boolean; right: boolean; up: boolean; down: boolean;
  }) => void;
  handleSelectWeapon: (client: Client, weapon: string) => void;
  handleAim: (client: Client, angle: number, power: number, facing?: -1 | 1) => void;
  handleFireNow: (client: Client) => void;
  handleCharge: (client: Client, charging: boolean) => void;
  handleReady: (client: Client, ready: boolean) => void;
  handleChat: (
    client: Client,
    meta: { messages: number[]; chats: number[] },
    text: string,
  ) => void;
  handleRematch: (client: Client) => void;
  handleAddBot: (client: Client, difficulty?: BotDifficulty) => void;
  handleRemoveBot: (client: Client, sessionId: string) => void;
  handleSetBotDifficulty: (
    client: Client,
    sessionId: string,
    difficulty: BotDifficulty,
  ) => void;
  handleSetMatchSettings: (
    client: Client,
    msg: {
      turnDurationSec?: number;
      fuelPerTurn?: number;
      startingHp?: number;
      maxWind?: number;
    },
  ) => void;
  handleSetLobbyConfig: (
    client: Client,
    msg: {
      lobbyName?: string;
      maxPlayers?: number;
      biome?: string;
      visibility?: "public" | "private";
      password?: string;
    },
  ) => void;
}

/** Validates and routes a client message to the appropriate handler.
 *  Applies the per-session message rate limit before parsing so a flood
 *  of invalid payloads can't exhaust the validator. */
export function dispatchClientMessage(
  handlers: MessageHandlers,
  client: Client,
  kind: string | number,
  payload: unknown,
  meta: { messages: number[]; chats: number[] },
): void {
  if (
    !rateAllow(
      meta.messages,
      MESSAGE_RATE_LIMIT.COUNT,
      MESSAGE_RATE_LIMIT.WINDOW_MS,
    )
  ) {
    return;
  }
  const result = ClientMessageSchema.safeParse({
    type: kind,
    ...(payload as object),
  });
  if (!result.success) {
    logger.debug({ kind, err: result.error.issues }, "dropped invalid message");
    return;
  }
  const msg = result.data;
  switch (msg.type) {
    case "input":
      handlers.handleInput(client, msg);
      break;
    case "selectWeapon":
      handlers.handleSelectWeapon(client, msg.weapon);
      break;
    case "aim":
      handlers.handleAim(client, msg.angle, msg.power, msg.facing);
      break;
    case "fire":
      handlers.handleFireNow(client);
      break;
    case "charge":
      handlers.handleCharge(client, msg.charging);
      break;
    case "ready":
      handlers.handleReady(client, msg.ready);
      break;
    case "chat":
      handlers.handleChat(client, meta, msg.text);
      break;
    case "rematch":
      handlers.handleRematch(client);
      break;
    case "addBot":
      handlers.handleAddBot(client, msg.difficulty as BotDifficulty | undefined);
      break;
    case "removeBot":
      handlers.handleRemoveBot(client, msg.sessionId);
      break;
    case "setBotDifficulty":
      handlers.handleSetBotDifficulty(
        client,
        msg.sessionId,
        msg.difficulty as BotDifficulty,
      );
      break;
    case "setMatchSettings":
      handlers.handleSetMatchSettings(client, msg);
      break;
    case "setLobbyConfig":
      handlers.handleSetLobbyConfig(client, msg);
      break;
  }
}
