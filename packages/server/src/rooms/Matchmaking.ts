import { matchMaker } from "@colyseus/core";
import { MODES, type GameMode } from "@artillery/shared";
import { logger } from "../logger.js";

/**
 * Periodic sweep that fills duel rooms with a bot if they've been sitting
 * with a lone human for longer than the mode's fill timeout.
 */
export function startMatchmakingMonitor(): void {
  setInterval(async () => {
    try {
      const rooms = await matchMaker.query({ name: "battle" });
      for (const r of rooms) {
        const mode = (r.metadata?.mode as GameMode | undefined) ?? "custom";
        const spec = MODES[mode];
        if (!spec.botFillAfterMs || r.clients >= spec.minPlayers) continue;
        if (r.clients === 0) continue;
        const elapsed = Date.now() - new Date(r.createdAt).getTime();
        if (elapsed < spec.botFillAfterMs) continue;
        logger.info({ roomId: r.roomId, mode, elapsed }, "filling room with bot");
        try {
          await matchMaker.remoteRoomCall(r.roomId, "addBot", []);
        } catch (err) {
          logger.warn({ err, roomId: r.roomId }, "bot fill failed");
        }
      }
    } catch (err) {
      logger.debug({ err }, "matchmaking sweep failed");
    }
  }, 5_000).unref?.();
}
