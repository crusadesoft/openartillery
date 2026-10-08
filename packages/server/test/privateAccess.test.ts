import type { AddressInfo } from "net";
import type { Server } from "http";
import express, { type Request, type Response } from "express";
import { monitor } from "@colyseus/monitor";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  isDirectPrivateRequest,
  isPrivateAddress,
  privateOnly,
} from "../src/middleware/privateAccess.js";
import { notFoundHandler } from "../src/middleware/error.js";

const fakeReq = (remoteAddress: string, headers: Record<string, string> = {}) =>
  ({ socket: { remoteAddress }, headers }) as unknown as Request;

// What Cloudflare Tunnel traffic looks like inside the container.
const TUNNEL = { "cf-connecting-ip": "203.0.113.5", "cf-ray": "abc-AMS" };

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "10.1.2.3",
    "172.18.0.1",
    "::ffff:172.18.0.1",
    "192.168.1.5",
    "fd12:3456::1",
  ])("%s is private", (a) => expect(isPrivateAddress(a)).toBe(true));

  it.each([
    "203.0.113.5",
    "::ffff:203.0.113.5",
    "172.32.0.1",
    "100.69.65.90",
    "2001:db8::1",
    "not-an-ip",
    undefined,
  ])("%s is not private", (a) => expect(isPrivateAddress(a)).toBe(false));
});

describe("isDirectPrivateRequest", () => {
  it("accepts direct requests from private addresses", () => {
    expect(isDirectPrivateRequest(fakeReq("127.0.0.1"))).toBe(true);
    expect(isDirectPrivateRequest(fakeReq("172.18.0.1"))).toBe(true);
  });

  it("refuses public addresses", () => {
    expect(isDirectPrivateRequest(fakeReq("203.0.113.5"))).toBe(false);
  });

  it.each([
    TUNNEL,
    { "cf-ray": "abc-AMS" },
    { "x-forwarded-for": "127.0.0.1" },
    { "x-real-ip": "127.0.0.1" },
    { forwarded: "for=127.0.0.1" },
  ])("refuses a private address relayed with %j", (headers) => {
    expect(isDirectPrivateRequest(fakeReq("172.18.0.1", headers))).toBe(false);
  });
});

describe("privateOnly", () => {
  it("skips the handler for refused requests", () => {
    const handler = vi.fn();
    const next = vi.fn();
    privateOnly(handler)(fakeReq("172.18.0.1", TUNNEL), {} as Response, next);
    expect(handler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});

describe("/colyseus monitor behind privateOnly", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // Same mount and fallthrough as src/index.ts.
    const app = express();
    app.use("/colyseus", privateOnly(monitor()));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/colyseus")) return next();
      res.status(404).send("<!doctype html>");
    });
    app.use(notFoundHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  const notFound = { status: 404, body: JSON.stringify({ error: "not_found" }) };
  async function get(urlPath: string, headers: Record<string, string> = {}) {
    const res = await fetch(base + urlPath, { headers });
    return { status: res.status, body: await res.text() };
  }

  it("serves the UI to direct loopback requests", async () => {
    const res = await get("/colyseus/");
    expect(res.status).toBe(200);
    expect(res.body).toContain("<html");
  });

  it("404s the UI through Cloudflare", async () => {
    expect(await get("/colyseus/", TUNNEL)).toEqual(notFound);
  });

  it("404s the room-call API through Cloudflare", async () => {
    const call = "/colyseus/api/room/call?roomId=x&method=disconnect&args=[]";
    expect(await get(call, TUNNEL)).toEqual(notFound);
  });
});
