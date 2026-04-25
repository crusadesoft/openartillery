import http from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RedisDriver } from "@colyseus/redis-driver";
import { RedisPresence } from "@colyseus/redis-presence";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { clientsTotal, roomsTotal } from "./metrics.js";

const useRedis = config.NODE_ENV === "production" || !!process.env.USE_REDIS;
const presence = useRedis ? new RedisPresence(config.REDIS_URL) : undefined;
const driver = useRedis ? new RedisDriver(config.REDIS_URL) : undefined;

export function createColyseus(httpServer: http.Server): Server {
  const gs = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    driver,
    presence,
    greet: false,
  });

  // Periodically publish room/client counts to Prometheus.
  setInterval(() => {
    matchMaker
      .query({})
      .then((rooms) => {
        roomsTotal.set(rooms.length);
        clientsTotal.set(rooms.reduce((sum, r) => sum + (r.clients ?? 0), 0));
      })
      .catch((err) => logger.debug({ err }, "room stats poll failed"));
  }, 5_000).unref?.();

  logger.info({ useRedis }, "colyseus server configured");
  return gs;
}

/** Drop `roomcaches` entries whose owning process is no longer in
 *  `colyseus:nodes`. The Redis driver only removes a room cache when
 *  its room is gracefully disposed; a process kill (OOM, hard restart,
 *  SIGKILL when SIGTERM times out) leaves the entry behind and it
 *  surfaces forever as a ghost lobby in `/api/rooms`. Run once at boot,
 *  before our own node registers — anything still tied to a dead
 *  process is unrecoverable, so reaping is safe. */
export async function cleanupStaleRoomCaches(): Promise<void> {
  if (!presence) return;
  const members = await presence.smembers("colyseus:nodes");
  const alive = new Set(members.map((m) => m.split("/")[0]));
  const cache = await presence.hgetall("roomcaches");
  const stale: string[] = [];
  for (const [roomId, raw] of Object.entries(cache ?? {})) {
    try {
      const room = JSON.parse(raw) as { processId?: string };
      if (!room.processId || !alive.has(room.processId)) stale.push(roomId);
    } catch {
      stale.push(roomId);
    }
  }
  if (stale.length === 0) {
    logger.info("no stale room caches");
    return;
  }
  for (const id of stale) await presence.hdel("roomcaches", id);
  logger.warn({ count: stale.length, roomIds: stale }, "reaped stale room caches");
}
