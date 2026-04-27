import { useEffect, useState } from "react";
import type { Route } from "../router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/authClient";
import { SfxButton } from "../ui/SfxButton";
import type { LeaderboardEntry } from "@artillery/shared";

interface Props { navigate: (r: Route) => void; }

/**
 * Recruiter's office. Frontal 2D scene. The whole page IS the room:
 * wallpaper across the top, finite-width executive desk centered at the
 * bottom sitting on a floor sliver, leather chair back peeking up
 * behind the desk top, banker's lamp + brass pen cup standing on the
 * desk top, brass nameplate engraved on the desk's modesty panel.
 *
 * Wall content (frontal-2D safe — everything pinned/hung is upright):
 * clock + window in the corners, framed officer mantel up top,
 * recruitment poster + DEPLOY CTA in the center, corkboard with
 * weather + ordnance briefings on the right.
 *
 * No flat documents on the desk — they wouldn't read in frontal view.
 * The visitor's stats / today's orders fold into the recruitment
 * poster's eyebrow + footer ticker so the wall stays sensible.
 */
export function HomePage({ navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [top, setTop] = useState<LeaderboardEntry[] | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    api.leaderboard(5).then((r) => setTop(r.entries)).catch(() => undefined);
  }, []);

  const eyebrow = session
    ? `OPERATOR ${session.user.username.toUpperCase()} · ${rankName(session.user.mmr)} · ${session.user.mmr} MMR`
    : "U.S. ARMOR CORPS · BRANCH 7G · ENLIST FOR ACCESS";

  return (
    <div className="recruiter-office scene-recruiter">
      <div className="office-room">
        {/* Backdrop wallpaper behind everything else. */}
        <div className="room-wallpaper" aria-hidden />

        {/* Wall fixtures — clock + window in the corners. */}
        <div className="room-clock" aria-label="Wall clock">
          <WallClock time={clock} />
        </div>

        {/* Officer mantel — horizontal row of framed top-brass photos. */}
        <div className="wall-mantel" aria-label="Officer gallery">
          <div className="mantel-label">OFFICERS · TOP BRASS</div>
          <div className="frames-row">
            {top === null && Array.from({ length: 5 }).map((_, i) => (
              <FrameSlot key={`l-${i}`} loading />
            ))}
            {top !== null && top.length === 0 && (
              <div className="mantel-empty">No ranked operators yet.</div>
            )}
            {top !== null && top.map((e) => (
              <FrameSlot
                key={e.rank}
                rank={e.rank}
                username={e.username}
                mmr={e.mmr}
                onClick={() => navigate({ name: "profile", username: e.username })}
              />
            ))}
          </div>
        </div>

        {/* Main wall content — recruitment poster + corkboard. */}
        <div className="wall-grid">
          <section className="wall-cell wall-poster" aria-label="Recruitment poster">
            <span className="poster-tape poster-tape-l" aria-hidden />
            <span className="poster-tape poster-tape-r" aria-hidden />
            <div className="poster-eyebrow">{eyebrow}</div>
            <h1 className="poster-headline">ENLIST &nbsp;·&nbsp; DEPLOY</h1>
            <div className="poster-subhead">YOUR THEATER AWAITS</div>
            <div className="poster-cta">
              <SfxButton
                className="primary-btn deploy-cta"
                onClick={() => navigate({ name: "play" })}
              >
                ▲ DEPLOY TO BATTLE
              </SfxButton>
              <div className="poster-cta-row">
                <SfxButton className="secondary-btn" onClick={() => navigate({ name: "customize" })}>
                  Loadout
                </SfxButton>
                <SfxButton className="steel-btn" onClick={() => navigate({ name: "leaderboard" })}>
                  Top Brass
                </SfxButton>
                {!session && (
                  <SfxButton className="go-btn" onClick={() => navigate({ name: "register" })}>
                    Enlist
                  </SfxButton>
                )}
              </div>
            </div>
            <div className="poster-stamp" aria-hidden>BR. 7G</div>
          </section>

          <section className="wall-cell wall-window-cell" aria-label="Window">
            <div className="room-window">
              <div className="window-frame">
                <div className="window-pane window-pane-tl" />
                <div className="window-pane window-pane-tr" />
                <div className="window-pane window-pane-bl" />
                <div className="window-pane window-pane-br" />
                <div className="window-mullion-v" />
                <div className="window-mullion-h" />
                <div className="window-blinds" />
              </div>
              <div className="window-sill" />
            </div>
          </section>
        </div>

        {/* Floor sliver at the bottom — desk sits on it. */}
        <div className="room-floor" aria-hidden />

        {/* Executive desk — finite-width furniture object, frontal 2D. */}
        <div className="executive-desk" aria-label="Recruiter's desk">
          {/* Items that stand on the desk top — they extend UP from the
              top edge of the desk. Rendered before the desk slab so the
              slab's shadow can fall in front of them, but with higher
              z-index so they're not covered by it. */}
          <div className="desk-chair" aria-hidden>
            <div className="chair-back" />
            <div className="chair-coat" />
          </div>
          <div className="desk-lamp" aria-hidden>
            <div className="lamp-glow" />
            <div className="lamp-shade" />
            <div className="lamp-stem" />
            <div className="lamp-base" />
          </div>
          <div className="desk-pencup" aria-hidden>
            <span className="pen pen-1" />
            <span className="pen pen-2" />
            <span className="pen pen-3" />
            <span className="pencup-body" />
          </div>

          {/* Desk furniture itself: top slab + two pedestals + modesty
              panel between them with the engraved nameplate. */}
          {/* Desk seen from the visitor's side — drawers face the
              recruiter, so the visitor's view is a flat wood front
              (modesty panel + pedestal sides), no drawer pulls. */}
          <div className="desk-top" aria-hidden />
          <div className="desk-front" aria-hidden>
            <div className="desk-nameplate">SGT. M. HARDY · RECRUITER</div>
          </div>
          <div className="desk-foot desk-foot-l" aria-hidden />
          <div className="desk-foot desk-foot-r" aria-hidden />
        </div>

        <div className="room-vignette" aria-hidden />
      </div>
    </div>
  );
}

/* ───────────────────────── subcomponents ───────────────────────── */

function FrameSlot({
  rank, username, mmr, onClick, loading,
}: {
  rank?: number;
  username?: string;
  mmr?: number;
  onClick?: () => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="brass-frame loading">
        <div className="frame-mat"><div className="frame-portrait" /></div>
      </div>
    );
  }
  const tilt = ((rank ?? 0) * 13) % 5 - 2;
  return (
    <button
      type="button"
      className={`brass-frame rank-${rank}`}
      style={{ transform: `rotate(${tilt}deg)` }}
      onClick={onClick}
      title={`${username} — ${mmr} MMR`}
    >
      <div className="frame-mat">
        <div className="frame-portrait">
          <span className="portrait-silhouette" aria-hidden />
          <span className={`frame-rank-badge rank-${rank}`}>#{rank}</span>
        </div>
        <div className="frame-plate">
          <span className="frame-name">{username}</span>
        </div>
      </div>
    </button>
  );
}

function WallClock({ time }: { time: Date }) {
  const h = time.getHours() % 12;
  const m = time.getMinutes();
  const s = time.getSeconds();
  const hourDeg = (h + m / 60) * 30;
  const minDeg = (m + s / 60) * 6;
  const secDeg = s * 6;
  return (
    <div className="clock-face">
      <div className="clock-brand">REGULATION · ZULU</div>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className={`clock-tick ${i % 3 === 0 ? "major" : ""}`}
          style={{ transform: `rotate(${i * 30}deg) translateY(-32px)` }}
        />
      ))}
      <span className="clock-hand clock-hand-h" style={{ transform: `rotate(${hourDeg}deg)` }} />
      <span className="clock-hand clock-hand-m" style={{ transform: `rotate(${minDeg}deg)` }} />
      <span className="clock-hand clock-hand-s" style={{ transform: `rotate(${secDeg}deg)` }} />
      <span className="clock-pivot" aria-hidden />
    </div>
  );
}

function rankName(mmr: number): string {
  if (mmr >= 2400) return "GENERAL";
  if (mmr >= 2100) return "COLONEL";
  if (mmr >= 1900) return "MAJOR";
  if (mmr >= 1700) return "CAPTAIN";
  if (mmr >= 1500) return "LIEUTENANT";
  if (mmr >= 1300) return "SERGEANT";
  if (mmr >= 1100) return "CORPORAL";
  if (mmr >= 900) return "PRIVATE";
  return "RECRUIT";
}
