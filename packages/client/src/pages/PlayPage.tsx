import { useEffect, useMemo, useState } from "react";
import { BIOMES, type BiomeId, type LobbySummary } from "@artillery/shared";
import { api } from "../auth/authClient";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export function PlayPage({ navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem("artillery:guestName") ?? "",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [lobbies, setLobbies] = useState<LobbySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ticker so "2m ago" labels creep forward without each lobby row
  // subscribing to its own interval.
  const [nowTick, setNowTick] = useState(() => Date.now());

  const validGuest = /^[A-Za-z0-9_]{3,16}$/.test(guestName.trim());
  const showGuestError = !session && !!error && !validGuest;

  useEffect(() => {
    if (validGuest && error) setError(null);
  }, [validGuest, error]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const { lobbies } = await api.rooms();
        if (!cancelled) setLobbies(lobbies);
      } catch {
        if (!cancelled) setLobbies([]);
      }
    };
    refresh();
    const id = window.setInterval(refresh, 2500);
    const tickId = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearInterval(tickId);
    };
  }, []);

  const stats = useMemo(() => {
    if (!lobbies) return null;
    const open = lobbies.length;
    const players = lobbies.reduce((n, l) => n + l.currentPlayers, 0);
    const publicCount = lobbies.filter((l) => l.visibility === "public").length;
    return { open, players, publicCount };
  }, [lobbies]);

  const ensureName = (): boolean => {
    if (session) return true;
    const cleaned = guestName.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleaned)) {
      setError("Set a callsign below before deploying (3–16 letters, numbers, or underscores).");
      const el = document.querySelector<HTMLInputElement>(
        'input[data-callsign-field]',
      );
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    }
    localStorage.setItem("artillery:guestName", cleaned);
    return true;
  };

  const quickPlay = () => {
    if (!ensureName()) return;
    navigate({ name: "game", mode: "ffa" });
  };

  const joinLobby = (roomId: string) => {
    if (!ensureName()) return;
    navigate({ name: "game", mode: "custom", roomId });
  };

  const joinInvite = () => {
    if (!ensureName()) return;
    if (inviteCode.trim().length < 4) return;
    const pw = invitePassword.trim();
    if (pw) sessionStorage.setItem("artillery:joinPassword", pw);
    else sessionStorage.removeItem("artillery:joinPassword");
    navigate({ name: "game", mode: "private", inviteCode: inviteCode.trim().toUpperCase() });
  };

  const createLobby = () => {
    if (!ensureName()) return;
    navigate({ name: "game", mode: "custom", create: true });
  };

  return (
    <div className="container play-screen">
      <div className="play-heading">
        <h1>// Deployment</h1>
        <p className="tagline">
          Pick a queue, host a custom lobby, or slip in with an invite code.
        </p>
      </div>

      {!session && (
        <div className="play-callsign">
          <label htmlFor="callsign-input">Guest callsign</label>
          <input
            id="callsign-input"
            data-callsign-field
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="3–16 characters, A–Z 0–9 _"
            maxLength={16}
            style={{
              borderColor: showGuestError ? "var(--danger)" : undefined,
            }}
          />
          <span className={`play-callsign-status ${validGuest ? "ok" : ""}`}>
            {validGuest ? "READY" : "NEEDED"}
          </span>
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      <div className="play-hero">
        <button
          className="play-hero-card quick"
          onClick={quickPlay}
          type="button"
        >
          <div className="play-hero-eyebrow">01 · Fast Deploy</div>
          <div className="play-hero-title">Quick Play · Ranked</div>
          <div className="play-hero-blurb">
            Jump into the matchmaker. Fills with bots if the queue's cold.
            Wins and losses count.
          </div>
          <div className="play-hero-cta">▲ Deploy</div>
        </button>

        <button
          className="play-hero-card host"
          onClick={createLobby}
          type="button"
        >
          <div className="play-hero-eyebrow">02 · Host a Room</div>
          <div className="play-hero-title">Create Custom Lobby</div>
          <div className="play-hero-blurb">
            Pick the biome, bots, max players, and visibility. Friends join
            from the browser or with an invite code.
          </div>
          <div className="play-hero-cta">+ Open Lobby</div>
        </button>
      </div>

      <section className="play-invite">
        <div className="play-invite-header">
          <div className="play-section-eyebrow">03 · Got an Invite?</div>
          <div className="play-invite-tag">PRIVATE ROOMS</div>
        </div>
        <div className="play-invite-row">
          <div className="field play-invite-field-code">
            <label htmlFor="invite-code-input">Invite code</label>
            <input
              id="invite-code-input"
              placeholder="XXXXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textAlign: "center", letterSpacing: "0.4em", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div className="field play-invite-field-pass">
            <label htmlFor="invite-pass-input">Passcode</label>
            <input
              id="invite-pass-input"
              type="text"
              placeholder="if the host set one"
              value={invitePassword}
              onChange={(e) => setInvitePassword(e.target.value)}
              maxLength={64}
              name="room-passcode"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore=""
              data-form-type="other"
              style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
            />
          </div>
          <SfxButton
            className="primary-btn play-invite-submit"
            disabled={inviteCode.trim().length < 4}
            onClick={joinInvite}
          >
            Deploy
          </SfxButton>
        </div>
      </section>

      <section className="play-lobbies">
        <header className="play-section-header">
          <div>
            <div className="play-section-eyebrow">04 · Live Lobbies</div>
            <h2>Open Rooms</h2>
          </div>
          <div className="play-live-bar">
            <span className="play-pulse" aria-hidden />
            {stats === null ? (
              "SCANNING…"
            ) : stats.open === 0 ? (
              "NO ROOMS · BE THE FIRST"
            ) : (
              <>
                {stats.open} ROOM{stats.open === 1 ? "" : "S"}
                {" · "}
                {stats.players} PLAYER{stats.players === 1 ? "" : "S"}
              </>
            )}
          </div>
        </header>

        {lobbies === null ? (
          <p className="ops-muted">Receiving telemetry…</p>
        ) : lobbies.length === 0 ? (
          <div className="play-empty">
            <div className="play-empty-title">No open rooms right now.</div>
            <div className="play-empty-blurb">
              Hit <strong>Create Custom Lobby</strong> above and others will
              see you show up here.
            </div>
          </div>
        ) : (
          <ul className="lobby-browser">
            {lobbies.map((r) => {
              const biome = BIOMES[r.biome as BiomeId];
              const full = r.currentPlayers >= r.maxPlayers;
              const isPrivate = r.visibility === "private";
              const stripeColor = biome
                ? `#${biome.grass.toString(16).padStart(6, "0")}`
                : "var(--ink-faint)";
              const age = relativeTime(r.createdAt, nowTick);
              return (
                <li
                  key={r.roomId}
                  className={`lobby-row ${isPrivate ? "private" : ""}`}
                  style={{ borderLeftColor: isPrivate ? undefined : stripeColor }}
                >
                  <div className="lobby-row-count">
                    <span className="lobby-row-count-num">{r.currentPlayers}</span>
                    <span className="lobby-row-count-sep">/</span>
                    <span className="lobby-row-count-cap">{r.maxPlayers}</span>
                  </div>
                  <div className="lobby-row-main">
                    <div className="lobby-row-name">
                      {r.lobbyName || "Lobby"}
                      {isPrivate && <span className="lobby-chip private">PRIVATE</span>}
                      {r.ranked && <span className="lobby-chip ranked">RANKED</span>}
                      {!isPrivate && full && <span className="lobby-chip muted">FULL</span>}
                    </div>
                    <div className="lobby-row-meta">
                      {r.hostName ? <>Host <strong>{r.hostName}</strong></> : "—"}
                      {" · "}
                      {biome?.label ?? (r.biome || "Mystery")}
                      {" · "}
                      <span className="lobby-row-age">{age}</span>
                    </div>
                  </div>
                  <SfxButton
                    className={isPrivate ? "ghost-btn" : "secondary-btn"}
                    disabled={full || isPrivate}
                    onClick={() => joinLobby(r.roomId)}
                    title={isPrivate ? "Private lobby — needs an invite code" : undefined}
                  >
                    {isPrivate ? "Locked" : full ? "Full" : "Join"}
                  </SfxButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function relativeTime(createdAt: number, now: number): string {
  const diff = Math.max(0, now - createdAt);
  const s = Math.floor(diff / 1000);
  if (s < 10) return "just opened";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
