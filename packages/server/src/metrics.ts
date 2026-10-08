import { createHash, timingSafeEqual } from "crypto";
import client from "prom-client";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { isDirectPrivateRequest } from "./middleware/privateAccess.js";

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

// Client build directories served by express.static. Requests under these
// get their directory as the route label; see routeLabel.
const STATIC_DIRS = new Set(["assets", "audio", "textures", "icons", "cursors"]);

/**
 * The `route` label for a finished request. Every value comes from a fixed
 * set (route patterns, mount points, STATIC_DIRS, "unmatched") so junk URLs
 * can't create new time series.
 *
 * - A matched route gets its pattern with the router's mount point, e.g.
 *   "/api/users/:id". The SPA catch-all is "*", including requests it
 *   passes on to notFoundHandler (e.g. GET /api/nope).
 * - A response sent by a router's own middleware, before any route matched
 *   (rate limiter 429s, the monitor's static files), gets "<mount>/*".
 * - Paths under a STATIC_DIRS directory get "/<dir>".
 * - Everything else, including root files like /robots.txt, is "unmatched".
 */
export function routeLabel(req: Request): string {
  // baseUrl echoes the URL's casing (/API/rooms matches the /api mount), so
  // lowercase it to keep one series per mount point.
  const base = (req.baseUrl ?? "").toLowerCase();
  const pattern: unknown = req.route?.path;
  if (typeof pattern === "string") return base + pattern;
  if (base) return `${base}/*`;
  const firstSegment = req.path.split("/")[1] ?? "";
  if (STATIC_DIRS.has(firstSegment)) return `/${firstSegment}`;
  return "unmatched";
}

export function httpTiming(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.METRICS_ENABLED) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const labels = {
        method: req.method,
        route: routeLabel(req),
        status: String(res.statusCode),
      };
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, seconds);
    });
    next();
  };
}

function hasBearerToken(req: Request, token: string): boolean {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? "");
  if (!match) return false;
  // Hash both sides so timingSafeEqual gets equal-length inputs.
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(token).digest();
  return timingSafeEqual(given, expected);
}

/**
 * Who may read /metrics:
 * - With METRICS_TOKEN set: only requests carrying `Authorization: Bearer
 *   <token>`, wherever they come from.
 * - Without it: only direct requests from a loopback or private address,
 *   e.g. a Prometheus on the same host or Docker network (see
 *   isDirectPrivateRequest for why proxied requests never count).
 */
export function isMetricsRequestAllowed(
  req: Request,
  token: string | undefined,
): boolean {
  if (token) return hasBearerToken(req, token);
  return isDirectPrivateRequest(req);
}

/**
 * Route guard for /metrics. Denied requests skip the route, so they get the
 * same 404 as when /metrics isn't mounted at all (METRICS_ENABLED=false).
 */
export function metricsAccess(token: string | undefined): RequestHandler {
  return (req, _res, next) =>
    next(isMetricsRequestAllowed(req, token) ? undefined : "route");
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.setHeader("Content-Type", registry.contentType);
    // Responses can cross Cloudflare with a token; never let one be cached.
    res.setHeader("Cache-Control", "no-store");
    res.send(await registry.metrics());
  } catch (err) {
    logger.error({ err }, "metrics export failed");
    res.status(500).send("metrics_error");
  }
}
