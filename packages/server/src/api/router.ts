import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { apiLimiter } from "../middleware/rateLimit.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/error.js";
import type { LeaderboardEntry, MatchSummary, PublicProfile } from "@artillery/shared";

export const apiRouter = Router();
apiRouter.use(apiLimiter);

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
          where: sql`${schema.matchParticipants.matchId} = ANY(${ids})`,
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
