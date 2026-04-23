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
import { config } from "./config.js";
import { logger, httpLogger, requestId } from "./logger.js";
import { httpTiming, metricsHandler } from "./metrics.js";
import { authRouter } from "./auth/router.js";
import { apiRouter } from "./api/router.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createColyseus } from "./colyseus.js";
import { BattleRoom } from "./rooms/BattleRoom.js";
import { startMatchmakingMonitor } from "./rooms/Matchmaking.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(requestId);
app.use(httpLogger);
app.use(httpTiming());
app.use(
  helmet({
    contentSecurityPolicy: config.NODE_ENV === "production" ? undefined : false,
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

httpServer.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    "artillery server listening",
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, "shutting down");
    await gameServer.gracefullyShutdown(true).catch(() => undefined);
    httpServer.close();
    process.exit(0);
  });
}
