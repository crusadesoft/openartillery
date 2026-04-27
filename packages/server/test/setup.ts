import { beforeAll } from "vitest";
import { initRapier } from "../src/physics/rapierWorld.js";

beforeAll(async () => {
  await initRapier();
});
