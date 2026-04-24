import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { monitor } from "@colyseus/monitor";
import { Encoder } from "@colyseus/schema";
// The heightmap alone is ~19 KB (2400 floats × 8), well beyond the 8 KB default.
Encoder.BUFFER_SIZE = 128 * 1024;
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "./config.js";
import { logger, httpLogger, requestId } from "./logger.js";
import { httpTiming, metricsHandler } from "./metrics.js";
import { authRouter } from "./auth/router.js";
import { apiRouter } from "./api/router.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createColyseus } from "./colyseus.js";
import { BattleRoom } from "./rooms/BattleRoom.js";
import { startMatchmakingMonitor } from "./rooms/Matchmaking.js";
import { db, pool } from "./db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(requestId);
app.use(httpLogger);
app.use(httpTiming());
app.use(
  helmet({
    contentSecurityPolicy:
      config.NODE_ENV === "production"
        ? {
            useDefaults: true,
            directives: {
              // Client opens a WebSocket to the same origin for Colyseus
              // and fetches matchmake HTTP. Allow both schemes to self.
              "connect-src": ["'self'", "ws:", "wss:"],
              // Cloudflare auto-injects a beacon from this host; without
              // it CSP blocks the beacon script.
              "script-src": ["'self'", "https://static.cloudflareinsights.com"],
              // Phaser + tank previews draw to canvas and use inline
              // <style> from our CSS-in-JS; allow inline styles and
              // the Google Fonts stylesheet the index.html pulls in.
              "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              // Google Fonts serves the actual font files from gstatic.
              "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
              // Tank/weapon sprites are data: URIs generated at runtime.
              "img-src": ["'self'", "data:", "blob:"],
              // Drop the upgrade-insecure-requests directive so local dev
              // builds reachable over http still work if we ever proxy.
              "upgrade-insecure-requests": null,
            },
          }
        : false,
  }),
);
app.use(
  cors({
    origin:
      config.NODE_ENV === "production"
        ? [config.PUBLIC_ORIGIN]
        : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, node: process.version, env: config.NODE_ENV });
});
app.get("/metrics", metricsHandler);

app.use("/auth", authRouter);
app.use("/api", apiRouter);

if (config.ENABLE_COLYSEUS_MONITOR) {
  app.use("/colyseus", monitor());
}

// Serve built client in production.
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/colyseus") || req.path.startsWith("/metrics") || req.path.startsWith("/health")) {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);
const gameServer = createColyseus(httpServer);

gameServer.define("battle", BattleRoom).filterBy(["mode", "inviteCode"]);

startMatchmakingMonitor();

async function bootstrap(): Promise<void> {
  // Run pending migrations before accepting traffic. Idempotent — Drizzle
  // tracks applied migrations in a metadata table, so a fresh boot after
  // a migration-less restart is a no-op. Makes "forgot to migrate" a
  // class of production bug we don't have.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsFolder = path.resolve(__dirname, "./db/migrations");
  try {
    await migrate(db, { migrationsFolder });
    logger.info({ migrationsFolder }, "migrations applied");
  } catch (err) {
    logger.error({ err, migrationsFolder }, "migrations failed");
    throw err;
  }

  // Warm one pool connection so the first request doesn't pay the
  // connect RTT + TLS handshake — that was the source of transient
  // cold-start 500s on /api/* right after a deploy.
  try {
    const c = await pool.connect();
    c.release();
    logger.info("pg pool warmed");
  } catch (err) {
    logger.error({ err }, "pg pool warmup failed");
    throw err;
  }

  httpServer.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      "artillery server listening",
    );
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "server bootstrap failed");
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, "shutting down");
    await gameServer.gracefullyShutdown(true).catch(() => undefined);
    httpServer.close();
    process.exit(0);
  });
}
