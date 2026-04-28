import { z } from "zod";

/**
 * `z.coerce.boolean()` calls `Boolean(value)`, which treats the string
 * "false" as truthy (it's a non-empty string). That's the wrong default
 * for env vars — operators expect SHOP_DEV_MODE=false to be false.
 */
const envBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return def;
      return /^(1|true|yes|on)$/i.test(v.trim());
    });

/**
 * Centralised, strictly-validated configuration. Fail fast at startup if
 * anything critical is missing or malformed — makes misconfiguration loud.
 */
const BaseSchema = z.object({
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

  XSOLLA_MERCHANT_ID: z.string().optional(),
  XSOLLA_PROJECT_ID: z.string().optional(),
  XSOLLA_API_KEY: z.string().optional(),
  XSOLLA_WEBHOOK_SECRET: z.string().optional(),
  XSOLLA_SANDBOX: envBool(true),
  // When set, /api/shop/checkout returns a fake success URL and the webhook
  // path can be hit directly with no signature for local dev.
  SHOP_DEV_MODE: envBool(false),
  // Master kill-switch for paid purchases. When false the catalog still
  // renders (so players can preview), but the Buy button is disabled with
  // a "Coming soon" notice and /api/shop/checkout returns 503. Used while
  // we wait for Xsolla's launch approval.
  SHOP_ENABLED: envBool(true),
});

/**
 * Production guardrails. The deploy script (`docker compose up -d server`)
 * relies on the healthcheck flipping to "healthy" before traffic shifts —
 * a config error that prevents listen() means the new container never
 * passes the healthcheck and the previous one keeps serving. So invalid
 * production config blocks the deploy instead of silently shipping.
 */
const Schema = BaseSchema.superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== "production") return;

  if (cfg.SHOP_DEV_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SHOP_DEV_MODE"],
      message:
        "SHOP_DEV_MODE bypasses payment and must be false in production",
    });
  }

  const xsollaKeys = [
    "XSOLLA_MERCHANT_ID",
    "XSOLLA_PROJECT_ID",
    "XSOLLA_API_KEY",
    "XSOLLA_WEBHOOK_SECRET",
  ] as const;
  for (const key of xsollaKeys) {
    if (!cfg[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required in production (cosmetics shop)`,
      });
    }
  }
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
