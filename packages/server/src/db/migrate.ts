import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, "./migrations");
  logger.info({ migrationsFolder }, "running migrations");
  await migrate(db, { migrationsFolder });
  logger.info("migrations complete");
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "migration failed");
  process.exit(1);
});
