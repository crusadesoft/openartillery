import { eq, sql } from "drizzle-orm";
import {
  Player,
  computeEloUpdates,
  DEFAULT_MMR,
  type GameMode,
} from "@artillery/shared";
import { db, schema } from "../db/index.js";
import { logger } from "../logger.js";

export interface PersistMatchInput {
  mode: GameMode;
  /** Lobby's ranked toggle at match end — drives ELO + win/loss writes. */
  ranked: boolean;
  startedAt: Date;
  endedAt: Date;
  winnerUserId: string | null;
  summary: Record<string, unknown>;
  events: unknown[];
  players: Player[];
  /** matching placements[i] for players[i] (0 = first) */
  placements: number[];
}

/**
 * Persist a finished match, update per-user aggregate stats and (if ranked)
 * recompute MMR. Bots and guests are included in event logs but never
 * modify the users table.
 */
export async function persistMatch(input: PersistMatchInput): Promise<string> {
  const { mode, startedAt, endedAt, winnerUserId, summary, events } = input;
  const ranked = input.ranked && input.players.filter((p) => !p.bot).length >= 2;

  const playerIds = input.players.map((p) => p.id);
  const currentRatings = input.players.map((p) =>
    p.userId ? p.mmr || DEFAULT_MMR : DEFAULT_MMR,
  );

  const eloUpdates = ranked
    ? computeEloUpdates({
        playerIds,
        ratings: currentRatings,
        placements: input.placements,
      })
    : playerIds.map((id, i) => ({
        playerId: id,
        before: currentRatings[i]!,
        after: currentRatings[i]!,
        delta: 0,
      }));
  const byId = new Map(eloUpdates.map((u) => [u.playerId, u]));

  const matchId = await db.transaction(async (tx) => {
    const [match] = await tx
      .insert(schema.matches)
      .values({
        mode,
        ranked,
        startedAt,
        endedAt,
        winnerUserId,
        summary,
        events,
      })
      .returning({ id: schema.matches.id });
    if (!match) throw new Error("match insert returned no row");

    for (let i = 0; i < input.players.length; i++) {
      const p = input.players[i]!;
      const placement = input.placements[i]!;
      const ratingChange = byId.get(p.id) ?? {
        before: currentRatings[i]!,
        after: currentRatings[i]!,
      };
      await tx.insert(schema.matchParticipants).values({
        matchId: match.id,
        userId: p.userId || null,
        displayName: p.name,
        isBot: p.bot,
        placement,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: Math.round(p.damageDealt),
        shotsFired: p.shotsFired,
        mmrBefore: ratingChange.before,
        mmrAfter: ratingChange.after,
      });
      if (p.userId && !p.bot) {
        const won = placement === 0;
        await tx
          .update(schema.users)
          .set({
            mmr: ratingChange.after,
            wins: sql`${schema.users.wins} + ${won ? 1 : 0}`,
            losses: sql`${schema.users.losses} + ${won ? 0 : 1}`,
            kills: sql`${schema.users.kills} + ${p.kills}`,
            deaths: sql`${schema.users.deaths} + ${p.deaths}`,
            matches: sql`${schema.users.matches} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, p.userId));
      }
    }
    return match.id;
  });

  logger.info({ matchId, mode, ranked }, "match persisted");
  return matchId;
}
