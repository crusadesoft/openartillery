import client from "prom-client";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const registry = new client.Registry();
if (config.METRICS_ENABLED) {
  client.collectDefaultMetrics({ register: registry });
}

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const roomsTotal = new client.Gauge({
  name: "colyseus_rooms_total",
  help: "Total Colyseus rooms (all modes)",
  registers: [registry],
});
export const clientsTotal = new client.Gauge({
  name: "colyseus_clients_total",
  help: "Total connected clients",
  registers: [registry],
});
export const matchesStarted = new client.Counter({
  name: "matches_started_total",
  help: "Matches that entered the playing phase",
  labelNames: ["mode"],
  registers: [registry],
});
export const matchesFinished = new client.Counter({
  name: "matches_finished_total",
  help: "Matches that reached a winner or expired",
  labelNames: ["mode", "outcome"],
  registers: [registry],
});

export function httpTiming(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.METRICS_ENABLED) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const route = (req.route?.path as string | undefined) ?? req.path ?? "unknown";
      const labels = { method: req.method, route, status: String(res.statusCode) };
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, seconds);
    });
    next();
  };
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.setHeader("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  } catch (err) {
    logger.error({ err }, "metrics export failed");
    res.status(500).send("metrics_error");
  }
}
