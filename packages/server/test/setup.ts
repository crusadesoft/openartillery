import { beforeAll } from "vitest";
import { initRapier } from "../src/physics/rapierWorld.js";

// src/config.ts validates process.env when it's first imported. Fill in the
// required values so tests can import modules that read config.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-32-chars";

beforeAll(async () => {
  await initRapier();
});
