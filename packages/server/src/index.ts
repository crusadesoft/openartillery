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
import { httpTiming, metricsAccess, metricsHandler } from "./metrics.js";
import { authRouter } from "./auth/router.js";
import { apiRouter } from "./api/router.js";
import { webhooksRouter } from "./api/webhooks.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { privateOnly } from "./middleware/privateAccess.js";
import { createColyseus, cleanupStaleRoomCaches } from "./colyseus.js";
import { BattleRoom } from "./rooms/BattleRoom.js";
import { startMatchmakingMonitor } from "./rooms/Matchmaking.js";
import { db, pool } from "./db/index.js";
import { initRapier } from "./physics/rapierWorld.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
// One canonical host, so search engines don't split ranking between
// www.openartillery.net and openartillery.net.
app.use((req, res, next) => {
  if (req.hostname.startsWith("www.") && (req.method === "GET" || req.method === "HEAD")) {
    return res.redirect(301, `https://${req.hostname.slice(4)}${req.originalUrl}`);
  }
  next();
});
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
// Webhooks consume the raw request body for signature verification and
// must be mounted BEFORE express.json() rewrites req.body.
app.use("/webhooks", webhooksRouter);

app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, node: process.version, env: config.NODE_ENV });
});
if (config.METRICS_ENABLED) {
  app.get("/metrics", metricsAccess(config.METRICS_TOKEN), metricsHandler);
}

app.use("/auth", authRouter);
app.use("/api", apiRouter);

// Never public: its API can call any method on any room. Reach it from the
// VPS itself or through an SSH tunnel (README "Deploy").
if (config.ENABLE_COLYSEUS_MONITOR) {
  app.use("/colyseus", privateOnly(monitor()));
}

// Serve built client in production.
//
// Cache strategy: anything under `/assets/` is Vite's content-hashed
// bundle — the URL changes whenever the file does, so we mark those
// `immutable` for a year. Everything else (notably `index.html`, which
// pins the asset URLs) gets `no-cache` so browsers + Cloudflare always
// revalidate. Without this, post-deploy users keep loading the old
// index.html from cache and chase asset URLs that no longer exist.
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(
  express.static(clientDist, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);
// First path segments the client router promotes into hash routes
// (see useRouter in packages/client/src/router.tsx). Deep links like
// /play get a 200; any other path still gets the app, but with a 404
// so crawlers don't index junk URLs as duplicates of the homepage.
const CLIENT_ROUTES = new Set(["login", "register", "play", "leaderboard", "settings", "customize", "arsenal", "about", "profile", "game"]);
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/webhooks") || req.path.startsWith("/colyseus") || req.path.startsWith("/metrics") || req.path.startsWith("/health")) {
    return next();
  }
  const firstSegment = req.path.split("/")[1] ?? "";
  if (req.path !== "/" && !CLIENT_ROUTES.has(firstSegment)) res.status(404);
  res.setHeader("Cache-Control", "no-cache");
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
  // Boot the Rapier WASM module before any room can construct its
  // physics integrator. ~30ms cold start; running it ahead of listen
  // keeps the first match's `onCreate` fast.
  await initRapier();
  logger.info("rapier physics initialised");

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

  try {
    await cleanupStaleRoomCaches();
  } catch (err) {
    logger.error({ err }, "stale room cache cleanup failed");
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
