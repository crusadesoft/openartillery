import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars",
};

const load = (extra: Record<string, string>) => loadConfig({ ...BASE_ENV, ...extra });

describe("METRICS_ENABLED", () => {
  it("defaults to true when unset or empty", () => {
    expect(load({}).METRICS_ENABLED).toBe(true);
    expect(load({ METRICS_ENABLED: "" }).METRICS_ENABLED).toBe(true);
  });

  it.each(["true", "1", "TRUE", " yes "])("treats %j as true", (v) => {
    expect(load({ METRICS_ENABLED: v }).METRICS_ENABLED).toBe(true);
  });

  it.each(["false", "0", "FALSE", "off"])("treats %j as false", (v) => {
    expect(load({ METRICS_ENABLED: v }).METRICS_ENABLED).toBe(false);
  });
});

describe("ENABLE_COLYSEUS_MONITOR", () => {
  it("defaults to false when unset or empty", () => {
    expect(load({}).ENABLE_COLYSEUS_MONITOR).toBe(false);
    expect(load({ ENABLE_COLYSEUS_MONITOR: "" }).ENABLE_COLYSEUS_MONITOR).toBe(false);
  });

  it.each(["true", "1"])("treats %j as true", (v) => {
    expect(load({ ENABLE_COLYSEUS_MONITOR: v }).ENABLE_COLYSEUS_MONITOR).toBe(true);
  });

  it.each(["false", "0"])("treats %j as false", (v) => {
    expect(load({ ENABLE_COLYSEUS_MONITOR: v }).ENABLE_COLYSEUS_MONITOR).toBe(false);
  });
});

describe("METRICS_TOKEN", () => {
  const token = "a".repeat(64);

  it("is undefined when unset, empty or blank", () => {
    expect(load({}).METRICS_TOKEN).toBeUndefined();
    expect(load({ METRICS_TOKEN: "" }).METRICS_TOKEN).toBeUndefined();
    expect(load({ METRICS_TOKEN: "   " }).METRICS_TOKEN).toBeUndefined();
  });

  it("keeps a long enough token, trimmed", () => {
    expect(load({ METRICS_TOKEN: ` ${token}\n` }).METRICS_TOKEN).toBe(token);
  });

  it("rejects a short token", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => load({ METRICS_TOKEN: "short" })).toThrow("Invalid configuration");
    error.mockRestore();
  });
});
