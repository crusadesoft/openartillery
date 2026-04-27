import { Router } from "express";
import { matchMaker } from "@colyseus/core";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { apiLimiter } from "../middleware/rateLimit.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/error.js";
import {
  isPaidTankSku,
  isTankSku,
  type LeaderboardEntry,
  type LoadoutSelection,
  type LobbySummary,
  type MatchSummary,
  type PublicProfile,
} from "@artillery/shared";
import {
  getOwnedTankSkus,
  grantEntitlement,
  listTanks,
  loadOwnedSelection,
  saveSelection,
} from "../shop/service.js";
import { createCheckout } from "../shop/xsolla.js";

export const apiRouter = Router();
apiRouter.use(apiLimiter);

apiRouter.get(
  "/rooms",
  asyncHandler(async (_req, res) => {
    const rooms = await matchMaker.query({ name: "battle" });
    const lobbies: LobbySummary[] = rooms
      .filter((r) => {
        const m = r.metadata ?? {};
        // Casual lobbies surface in the browser regardless of phase.
        // Started matches show up so players can see activity (and former
        // participants can rejoin); the client gates joining on phase +
        // userId membership.
        if (m.ranked) return false;
        const visibility = m.visibility === "private" ? "private" : "public";
        return visibility === "public" || visibility === "private";
      })
      .map((r) => {
        const m = r.metadata ?? {};
        const visibility: "public" | "private" =
          m.visibility === "private" ? "private" : "public";
        return {
          roomId: r.roomId,
          lobbyName: String(m.lobbyName ?? "Lobby"),
          hostName: String(m.hostName ?? ""),
          mode: String(m.mode ?? "custom"),
          biome: String(m.biome ?? ""),
          maxPlayers: Number(r.maxClients ?? 6),
          currentPlayers: Number(r.clients ?? 0),
          visibility,
          ranked: Boolean(m.ranked),
          hasBots: false,
          createdAt: new Date(r.createdAt).getTime(),
          inProgress: Boolean(m.started),
          participantUserIds: Array.isArray(m.participantUserIds)
            ? (m.participantUserIds as string[])
            : [],
          participantNames: Array.isArray(m.participantNames)
            ? (m.participantNames as string[])
            : [],
        } satisfies LobbySummary;
      });
    res.json({ lobbies });
  }),
);

apiRouter.get(
  "/leaderboard",
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Number(req.query.limit ?? 50) || 50);
    const rows = await db.query.users.findMany({
      // Tiebreak on wins first, then oldest account — without this, users
      // at 1200 MMR (default) shuffle between reloads.
      orderBy: [
        desc(schema.users.mmr),
        desc(schema.users.wins),
        schema.users.createdAt,
      ],
      limit,
    });
    const out: LeaderboardEntry[] = rows.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      mmr: u.mmr,
      wins: u.wins,
      losses: u.losses,
      kills: u.kills,
      matches: u.matches,
    }));
    res.json({ entries: out });
  }),
);

apiRouter.get(
  "/profile/:username",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const username = String(req.params.username ?? "").trim();
    if (!username) throw new HttpError(400, "missing username", "bad_request");
    const user = await db.query.users.findFirst({
      where: eq(schema.users.usernameLower, username.toLowerCase()),
    });
    if (!user) throw new HttpError(404, "not found", "not_found");
    const profile: PublicProfile = {
      id: user.id,
      username: user.username,
      mmr: user.mmr,
      wins: user.wins,
      losses: user.losses,
      kills: user.kills,
      deaths: user.deaths,
      matches: user.matches,
      createdAt: user.createdAt.toISOString(),
    };
    res.json({ profile });
  }),
);

apiRouter.get(
  "/matches/recent",
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Number(req.query.limit ?? 20) || 20);
    const rows = await db.query.matches.findMany({
      orderBy: [desc(schema.matches.startedAt)],
      limit,
    });
    const ids = rows.map((r) => r.id);
    const parts = ids.length
      ? await db.query.matchParticipants.findMany({
          where: inArray(schema.matchParticipants.matchId, ids),
        })
      : [];
    const byMatch = new Map<string, typeof parts>();
    for (const p of parts) {
      const arr = byMatch.get(p.matchId) ?? [];
      arr.push(p);
      byMatch.set(p.matchId, arr);
    }
    const summaries: MatchSummary[] = rows.map((m) => {
      const winnerRow = byMatch
        .get(m.id)
        ?.find((p) => m.winnerUserId && p.userId === m.winnerUserId);
      return {
        id: m.id,
        mode: m.mode,
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt.toISOString(),
        winnerUsername: winnerRow?.displayName ?? null,
        participants: (byMatch.get(m.id) ?? [])
          .sort((a, b) => a.placement - b.placement)
          .map((p) => ({
            username: p.displayName,
            placement: p.placement,
            kills: p.kills,
            damage: p.damageDealt,
            mmrDelta: p.mmrAfter - p.mmrBefore,
          })),
      };
    });
    res.json({ matches: summaries });
  }),
);

apiRouter.get(
  "/matches/:id/replay",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "");
    const match = await db.query.matches.findFirst({
      where: eq(schema.matches.id, id),
    });
    if (!match) throw new HttpError(404, "not found", "not_found");
    res.json({
      id: match.id,
      mode: match.mode,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      summary: match.summary,
      events: match.events,
    });
  }),
);

apiRouter.get(
  "/me/matches",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const parts = await db.query.matchParticipants.findMany({
      where: eq(schema.matchParticipants.userId, auth.userId),
      orderBy: [desc(schema.matchParticipants.id)],
      limit: 50,
    });
    res.json({ participants: parts });
  }),
);

apiRouter.get(
  "/me/loadout",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const { selection, ownedTanks } = await loadOwnedSelection(auth.userId);
    res.json({ selection, ownedSkus: [...ownedTanks] });
  }),
);

apiRouter.put(
  "/me/loadout",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const incoming = (req.body ?? {}) as Partial<LoadoutSelection>;
    const saved = await saveSelection(auth.userId, incoming);
    res.json({ selection: saved });
  }),
);

apiRouter.get(
  "/shop/tanks",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const owned = auth ? await getOwnedTankSkus(auth.userId) : new Set<string>();
    res.json({ tanks: listTanks(owned) });
  }),
);

apiRouter.post(
  "/shop/checkout",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { auth } = req as AuthedRequest;
    const sku = String(req.body?.sku ?? "");
    if (!isTankSku(sku) || !isPaidTankSku(sku)) {
      throw new HttpError(400, "unknown or free sku", "bad_request");
    }
    const owned = await getOwnedTankSkus(auth.userId);
    if (owned.has(sku)) {
      throw new HttpError(409, "already owned", "already_owned");
    }
    try {
      const session = await createCheckout(auth.userId, auth.username, sku);
      res.json({ url: session.url });
    } catch (err) {
      // Surface the underlying Xsolla error to logs so we can diagnose
      // 503s that would otherwise just say "failed with status code 503".
      const { logger } = await import("../logger.js");
      logger.error(
        { err, userId: auth.userId, username: auth.username, sku },
        "xsolla checkout failed",
      );
      throw new HttpError(
        503,
        err instanceof Error ? err.message : "checkout failed",
        "checkout_failed",
      );
    }
  }),
);

// Local-dev convenience: SHOP_DEV_MODE returns a synthetic checkout URL that
// hits this endpoint, which immediately grants the entitlement. Production
// builds (SHOP_DEV_MODE=false) treat this as a 404.
apiRouter.get(
  "/shop/dev-grant",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { config } = await import("../config.js");
    if (!config.SHOP_DEV_MODE) {
      throw new HttpError(404, "not found", "not_found");
    }
    const { auth } = req as AuthedRequest;
    const sku = String(req.query.sku ?? "");
    const externalId = String(req.query.externalId ?? "");
    if (!isPaidTankSku(sku)) {
      throw new HttpError(400, "unknown or free sku", "bad_request");
    }
    await grantEntitlement(auth.userId, sku, "dev", externalId);
    res.redirect(`${config.PUBLIC_ORIGIN}/#/customize?purchase=success`);
  }),
);
