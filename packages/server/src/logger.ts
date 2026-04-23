import pino from "pino";
import { pinoHttp } from "pino-http";
import type { Request, Response, NextFunction } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { config } from "./config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { svc: "artillery-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "accessToken",
      "refreshToken",
    ],
    censor: "[REDACTED]",
  },
});

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming.length ? incoming : randomUUID();
  (req as Request & { id: string }).id = id;
  res.setHeader("x-request-id", id);
  next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) =>
    (req as IncomingMessage & { id?: string }).id ?? randomUUID(),
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req: IncomingMessage & { id?: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
  },
});
