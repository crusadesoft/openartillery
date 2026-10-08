import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express, { Router, type Request } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  httpRequestsTotal,
  httpTiming,
  isMetricsRequestAllowed,
  metricsAccess,
  metricsHandler,
} from "../src/metrics.js";
import { notFoundHandler } from "../src/middleware/error.js";

const TOKEN = "t".repeat(64);

/** Same routing order as src/index.ts, trimmed to what affects labels. */
function buildApp(staticDir: string, token: string | undefined, onFinish: () => void) {
  const app = express();
  app.use(httpTiming());
  // Registered after httpTiming, so this fires once the counter is updated.
  app.use((_req, res, next) => {
    res.on("finish", onFinish);
    next();
  });

  const api = Router();
  api.use((req, res, next) =>
    req.headers["x-test-limit"] ? res.status(429).end() : next(),
  );
  api.get("/users/:id", (_req, res) => res.json({ ok: true }));
  app.use("/api", api);

  app.get("/metrics", metricsAccess(token), metricsHandler);
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/metrics")) return next();
    if (req.path !== "/" && req.path !== "/play") res.status(404);
    res.send("<!doctype html>");
  });
  app.use(notFoundHandler);
  return app;
}

async function startServer(token: string | undefined) {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-test-"));
  fs.mkdirSync(path.join(staticDir, "assets"));
  fs.writeFileSync(path.join(staticDir, "assets", "app.js"), "1");
  fs.writeFileSync(path.join(staticDir, "robots.txt"), "User-agent: *");

  let finished: () => void = () => {};
  const server: Server = buildApp(staticDir, token, () => finished()).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    /** Sends one request and resolves after the server recorded it. */
    async request(urlPath: string, init?: RequestInit) {
      const done = new Promise<void>((resolve) => (finished = resolve));
      const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, init);
      const body = await res.text();
      await done;
      return { status: res.status, body };
    },
    close() {
      server.close();
      fs.rmSync(staticDir, { recursive: true, force: true });
    },
  };
}

describe("route label", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    server = await startServer(undefined);
  });
  afterAll(() => server.close());
  beforeEach(() => httpRequestsTotal.reset());

  async function labelsFor(urlPath: string, init?: RequestInit) {
    await server.request(urlPath, init);
    const { values } = await httpRequestsTotal.get();
    expect(values).toHaveLength(1);
    return values[0].labels;
  }

  it.each([
    ["GET", "/api/users/42", "/api/users/:id", "200"],
    ["GET", "/API/users/43", "/api/users/:id", "200"],
    ["GET", "/api/users/42/", "/api/users/:id", "200"],
    ["GET", "/play", "*", "200"],
    ["GET", "/no/such/page-1", "*", "404"],
    ["GET", "/api/nope-1", "*", "404"],
    ["GET", "/assets/app.js", "/assets", "200"],
    ["GET", "/assets/missing.js", "*", "404"],
    ["GET", "/metrics", "/metrics", "200"],
    ["POST", "/random-junk-1", "unmatched", "404"],
    ["POST", "/api/nope-2", "unmatched", "404"],
    ["POST", "/textures/x.png", "/textures", "404"],
    ["GET", "/robots.txt", "unmatched", "200"],
  ])("%s %s → %s", async (method, urlPath, route, status) => {
    expect(await labelsFor(urlPath, { method })).toEqual({ method, route, status });
  });

  it("labels a router middleware's own response with the mount point", async () => {
    const labels = await labelsFor("/api/users/1", {
      headers: { "x-test-limit": "1" },
    });
    expect(labels).toEqual({ method: "GET", route: "/api/*", status: "429" });
  });

  it("keeps the series count fixed no matter how many junk URLs arrive", async () => {
    for (let i = 0; i < 20; i++) {
      await server.request(`/junk-${i}`, { method: "POST" });
      await server.request(`/junk-${i}`);
      await server.request(`/api/junk-${i}`);
    }
    const { values } = await httpRequestsTotal.get();
    expect(values.map((v) => `${v.labels.method} ${v.labels.route}`).sort()).toEqual([
      "GET *",
      "POST unmatched",
    ]);
  });
});

describe("isMetricsRequestAllowed", () => {
  const req = (remoteAddress: string, headers: Record<string, string> = {}) =>
    ({ socket: { remoteAddress }, headers }) as unknown as Request;

  it("without a token, allows direct private requests only", () => {
    expect(isMetricsRequestAllowed(req("172.18.0.1"), undefined)).toBe(true);
    expect(isMetricsRequestAllowed(req("203.0.113.5"), undefined)).toBe(false);
  });

  it("without a token, refuses anything relayed by a proxy", () => {
    // What Cloudflare Tunnel traffic looks like inside the container.
    const tunnel = { "cf-connecting-ip": "203.0.113.5", "cf-ray": "abc-AMS" };
    expect(isMetricsRequestAllowed(req("172.18.0.1", tunnel), undefined)).toBe(false);
  });

  it("with a token, requires it from every address", () => {
    expect(isMetricsRequestAllowed(req("127.0.0.1"), TOKEN)).toBe(false);
    expect(
      isMetricsRequestAllowed(
        req("127.0.0.1", { authorization: `Bearer ${TOKEN}x` }),
        TOKEN,
      ),
    ).toBe(false);
    expect(
      isMetricsRequestAllowed(
        req("127.0.0.1", { authorization: `Basic ${TOKEN}` }),
        TOKEN,
      ),
    ).toBe(false);
    expect(
      isMetricsRequestAllowed(
        req("203.0.113.5", { authorization: `Bearer ${TOKEN}` }),
        TOKEN,
      ),
    ).toBe(true);
    expect(
      isMetricsRequestAllowed(
        req("127.0.0.1", { authorization: `bearer ${TOKEN}` }),
        TOKEN,
      ),
    ).toBe(true);
  });
});

describe("GET /metrics", () => {
  const notFound = { status: 404, body: JSON.stringify({ error: "not_found" }) };

  describe("without a token", () => {
    let server: Awaited<ReturnType<typeof startServer>>;
    beforeAll(async () => {
      server = await startServer(undefined);
    });
    afterAll(() => server.close());

    it("serves direct loopback requests", async () => {
      const res = await server.request("/metrics");
      expect(res.status).toBe(200);
      expect(res.body).toContain("http_requests_total");
    });

    it("404s requests that came through Cloudflare, like an unknown path", async () => {
      const res = await server.request("/metrics", {
        headers: { "cf-connecting-ip": "203.0.113.5" },
      });
      expect(res).toEqual(notFound);
    });
  });

  describe("with a token", () => {
    let server: Awaited<ReturnType<typeof startServer>>;
    beforeAll(async () => {
      server = await startServer(TOKEN);
    });
    afterAll(() => server.close());

    it("serves requests with the token, even through Cloudflare", async () => {
      const res = await server.request("/metrics", {
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "cf-connecting-ip": "203.0.113.5",
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toContain("http_requests_total");
    });

    it("404s loopback requests without it", async () => {
      expect(await server.request("/metrics")).toEqual(notFound);
    });
  });
});
