import { z } from "zod";

/**
 * Centralised, strictly-validated configuration. Fail fast at startup if
 * anything critical is missing or malformed — makes misconfiguration loud.
 */
const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(2567),
  PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),
  ENABLE_COLYSEUS_MONITOR: z.coerce.boolean().default(true),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(32, "access secret must be ≥32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "refresh secret must be ≥32 chars"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(30 * 24 * 3600),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(6).max(128).default(8),

  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),

  DUEL_BOT_FILL_AFTER_MS: z.coerce.number().int().nonnegative().default(20_000),
  REPLAY_RETENTION_HOURS: z.coerce.number().int().positive().default(72),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  SENTRY_DSN: z.string().optional(),
});

export type AppConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("[config] invalid configuration:", parsed.error.flatten());
    throw new Error("Invalid configuration");
  }
  return parsed.data;
}

export const config = loadConfig();
