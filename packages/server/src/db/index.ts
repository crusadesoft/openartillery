import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => logger.error({ err }, "pg pool error"));

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
