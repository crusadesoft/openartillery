-- Tank model: loadouts now reference an atomic tank SKU plus a
-- separately-chosen decal. Old per-part columns are gone. No production
-- users have customised loadouts saved at this point, so we drop the
-- table outright instead of trying to migrate row data.
DROP TABLE IF EXISTS "user_loadouts";
--> statement-breakpoint
CREATE TABLE "user_loadouts" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "tank_sku" text NOT NULL,
  "decal" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
