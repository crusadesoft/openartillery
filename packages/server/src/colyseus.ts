import http from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RedisDriver } from "@colyseus/redis-driver";
import { RedisPresence } from "@colyseus/redis-presence";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { clientsTotal, roomsTotal } from "./metrics.js";

export function createColyseus(httpServer: http.Server): Server {
  const useRedis = config.NODE_ENV === "production" || !!process.env.USE_REDIS;
  const gs = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    driver: useRedis ? new RedisDriver(config.REDIS_URL) : undefined,
    presence: useRedis ? new RedisPresence(config.REDIS_URL) : undefined,
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
