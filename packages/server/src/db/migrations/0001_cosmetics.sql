CREATE TABLE IF NOT EXISTS "user_loadouts" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "turret" text NOT NULL,
  "barrel" text NOT NULL,
  "pattern" text NOT NULL,
  "decal" text NOT NULL,
  "primary_color" integer NOT NULL,
  "accent_color" integer NOT NULL,
  "pattern_color" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sku" text NOT NULL,
  "source" text NOT NULL,
  "external_id" text,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "entitlements_user_sku_key" UNIQUE ("user_id", "sku")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_user_idx" ON "entitlements" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sku" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "purchase_events_provider_external_key" UNIQUE ("provider", "external_id")
);
