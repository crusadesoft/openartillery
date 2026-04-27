import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    passwordHash: text("password_hash").notNull(),
    mmr: integer("mmr").notNull().default(1200),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    matches: integer("matches").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueUsername: unique("users_username_lower_key").on(t.usernameLower),
    mmrIdx: index("users_mmr_idx").on(t.mmr.desc()),
  }),
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("refresh_tokens_user_idx").on(t.userId),
    hashIdx: unique("refresh_tokens_hash_key").on(t.tokenHash),
  }),
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    ranked: boolean("ranked").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    winnerUserId: uuid("winner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** summary snapshot: seeds, wind history, weather, etc. */
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    /** event log for replays (compressed JSON) */
    events: jsonb("events").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    modeIdx: index("matches_mode_idx").on(t.mode),
    startedIdx: index("matches_started_idx").on(t.startedAt.desc()),
  }),
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    placement: integer("placement").notNull(),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    damageDealt: integer("damage_dealt").notNull().default(0),
    shotsFired: integer("shots_fired").notNull().default(0),
    mmrBefore: integer("mmr_before").notNull().default(1200),
    mmrAfter: integer("mmr_after").notNull().default(1200),
  },
  (t) => ({
    matchIdx: index("mp_match_idx").on(t.matchId),
    userIdx: index("mp_user_idx").on(t.userId),
  }),
);

export const userLoadouts = pgTable(
  "user_loadouts",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    tankSku: text("tank_sku").notNull(),
    decal: text("decal").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("entitlements_user_idx").on(t.userId),
    uniqueUserSku: unique("entitlements_user_sku_key").on(t.userId, t.sku),
  }),
);

export const purchaseEvents = pgTable(
  "purchase_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueProviderEvent: unique("purchase_events_provider_external_key").on(
      t.provider,
      t.externalId,
    ),
  }),
);

// Convenience view constant for SQL you may add later.
export const NOW = sql`now()`;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchParticipant = typeof matchParticipants.$inferSelect;
export type NewMatchParticipant = typeof matchParticipants.$inferInsert;
export type UserLoadout = typeof userLoadouts.$inferSelect;
export type NewUserLoadout = typeof userLoadouts.$inferInsert;
export type Entitlement = typeof entitlements.$inferSelect;
export type NewEntitlement = typeof entitlements.$inferInsert;
export type PurchaseEvent = typeof purchaseEvents.$inferSelect;
export type NewPurchaseEvent = typeof purchaseEvents.$inferInsert;
