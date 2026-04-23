CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL,
  "username_lower" text NOT NULL,
  "password_hash" text NOT NULL,
  "mmr" integer NOT NULL DEFAULT 1200,
  "wins" integer NOT NULL DEFAULT 0,
  "losses" integer NOT NULL DEFAULT 0,
  "kills" integer NOT NULL DEFAULT 0,
  "deaths" integer NOT NULL DEFAULT 0,
  "matches" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "users_username_lower_key" UNIQUE ("username_lower")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_mmr_idx" ON "users" ("mmr" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "refresh_tokens_hash_key" UNIQUE ("token_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mode" text NOT NULL,
  "ranked" boolean NOT NULL DEFAULT true,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz NOT NULL,
  "winner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "summary" jsonb NOT NULL,
  "events" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_mode_idx" ON "matches" ("mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_started_idx" ON "matches" ("started_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "display_name" text NOT NULL,
  "is_bot" boolean NOT NULL DEFAULT false,
  "placement" integer NOT NULL,
  "kills" integer NOT NULL DEFAULT 0,
  "deaths" integer NOT NULL DEFAULT 0,
  "damage_dealt" integer NOT NULL DEFAULT 0,
  "shots_fired" integer NOT NULL DEFAULT 0,
  "mmr_before" integer NOT NULL DEFAULT 1200,
  "mmr_after" integer NOT NULL DEFAULT 1200
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_match_idx" ON "match_participants" ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_user_idx" ON "match_participants" ("user_id");
