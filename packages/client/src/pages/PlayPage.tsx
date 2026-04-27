import { useEffect, useState } from "react";
import { BIOMES, type BiomeId, type LobbySummary } from "@artillery/shared";
import { api } from "../auth/authClient";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

const COORD_COLS = ["A","B","C","D","E","F","G","H","J","K","L"] as const;

function MapSvg(): JSX.Element {
  // Hand-drawn theater map. Sea on the left, peninsula coast, two ridge
  // systems with concentric contour rings, rivers, a lake, road network,
  // a railway, towns, a compass rose, scale bar and a cartouche.
  const ties = Array.from({ length: 32 }, (_, i) => i);
  return (
    <svg
      className="map-svg"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <pattern id="map-fields" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="14" stroke="#9b8a55" strokeWidth="0.6" opacity="0.5" />
        </pattern>
        <pattern id="map-marsh" patternUnits="userSpaceOnUse" width="22" height="14">
          <path d="M2 8 q3 -4 6 0 t6 0 t6 0" stroke="#5a7a82" strokeWidth="0.6" fill="none" opacity="0.7" />
        </pattern>
        <linearGradient id="map-paper-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ecdcab" />
          <stop offset="100%" stopColor="#d8c690" />
        </linearGradient>
      </defs>

      <rect width="1200" height="800" fill="url(#map-paper-grad)" />

      <path d="M0 0 L320 0 Q360 200 280 360 Q220 520 320 720 Q360 760 0 800 Z"
            fill="#a3bcc4" opacity="0.55" />
      <path d="M0 0 L260 0 Q310 180 240 340 Q180 500 280 700 Q310 760 0 800 Z"
            fill="#86a4ad" opacity="0.45" />
      <path d="M320 0 Q360 200 280 360 Q220 520 320 720 Q360 760 350 800"
            fill="none" stroke="#3a2818" strokeWidth="1.5" />
      <g stroke="#7a9aa2" strokeWidth="0.5" opacity="0.5" fill="none">
        <path d="M40 80 Q120 76 200 84" />
        <path d="M40 140 Q140 134 240 144" />
        <path d="M30 220 Q120 216 220 226" />
        <path d="M30 320 Q120 314 230 322" />
        <path d="M40 420 Q140 414 250 424" />
        <path d="M40 520 Q140 514 270 522" />
        <path d="M40 620 Q140 614 280 622" />
        <path d="M40 720 Q140 714 290 722" />
      </g>
      <text x="120" y="500" fontFamily="Oswald, sans-serif" fontSize="24" fill="#3a5a64" fontStyle="italic" letterSpacing="6" opacity="0.55">SEA OF FALK</text>

      <g fill="none" stroke="#7a4f1c" strokeWidth="0.9" opacity="0.7">
        <path d="M610 150 Q780 130 880 220 Q920 340 800 410 Q640 450 580 350 Q540 240 610 150 Z" />
        <path d="M640 195 Q760 180 840 250 Q880 350 800 395 Q670 425 620 345 Q580 270 640 195 Z" />
        <path d="M680 235 Q750 230 810 280 Q840 345 790 375 Q700 395 660 335 Q630 280 680 235 Z" />
        <path d="M710 275 Q745 275 780 305 Q800 340 770 360 Q720 380 695 345 Q680 310 710 275 Z" />
        <path d="M730 305 Q745 305 765 325 Q775 345 750 355 Q725 360 712 340 Q702 320 730 305 Z" />
      </g>
      <polygon points="745,335 740,348 752,348" fill="#3a2818" />
      <text x="755" y="345" fontFamily="Oswald, sans-serif" fontSize="11" fill="#3a2818" letterSpacing="2">PK 412</text>

      <g fill="none" stroke="#7a4f1c" strokeWidth="0.9" opacity="0.7">
        <path d="M880 540 Q970 520 1050 580 Q1080 660 1000 700 Q900 720 860 660 Q830 600 880 540 Z" />
        <path d="M900 565 Q970 550 1030 595 Q1055 650 990 685 Q910 700 880 650 Q860 610 900 565 Z" />
        <path d="M920 590 Q970 585 1010 615 Q1025 650 980 670 Q920 680 900 645 Q890 615 920 590 Z" />
        <path d="M945 620 Q975 620 995 640 Q1000 658 975 668 Q945 670 935 650 Q930 635 945 620 Z" />
      </g>
      <polygon points="970,650 965,663 977,663" fill="#3a2818" />
      <text x="982" y="660" fontFamily="Oswald, sans-serif" fontSize="11" fill="#3a2818" letterSpacing="2">PK 287</text>

      <g fill="none" stroke="#3a2818" strokeWidth="0.7" opacity="0.5" strokeDasharray="2 3">
        <path d="M460 580 Q540 560 600 600 Q620 660 560 690 Q480 700 450 650 Q435 610 460 580 Z" />
        <path d="M475 600 Q540 580 590 615 Q605 655 555 680 Q485 690 465 650 Q450 620 475 600 Z" />
      </g>

      <path d="M740 350 Q700 460 580 540 Q480 600 380 700 Q330 740 320 760"
            fill="none" stroke="#7a9aa2" strokeWidth="2.4" opacity="0.85" />
      <path d="M965 660 Q1000 680 1050 720 Q1100 760 1180 770"
            fill="none" stroke="#7a9aa2" strokeWidth="2.4" opacity="0.85" />

      <ellipse cx="540" cy="640" rx="34" ry="18" fill="#7a9aa2" opacity="0.7" stroke="#3a2818" strokeWidth="0.8" />
      <text x="510" y="668" fontFamily="Oswald, sans-serif" fontSize="9" fill="#3a2818" letterSpacing="1.5">L. ROMA</text>

      <polygon points="380,720 460,705 470,745 390,758" fill="url(#map-fields)" stroke="#7a4f1c" strokeWidth="0.5" opacity="0.7" />
      <polygon points="500,420 620,400 640,460 520,480" fill="url(#map-fields)" stroke="#7a4f1c" strokeWidth="0.5" opacity="0.6" />
      <polygon points="860,180 980,160 1000,220 880,240" fill="url(#map-fields)" stroke="#7a4f1c" strokeWidth="0.5" opacity="0.6" />

      <rect x="600" y="700" width="80" height="40" fill="url(#map-marsh)" stroke="#5a7a82" strokeWidth="0.5" opacity="0.6" />

      <g fill="none" stroke="#3a2818" strokeWidth="1.4" strokeDasharray="6 4" opacity="0.78">
        <path d="M360 180 Q540 200 700 260 L900 320 L1180 360" />
        <path d="M420 600 Q560 580 720 540 L900 480 L1180 440" />
        <path d="M700 260 L720 540" />
        <path d="M380 720 Q620 700 880 660 L1180 640" />
      </g>

      <g stroke="#3a2818" opacity="0.85">
        <line x1="320" y1="700" x2="1190" y2="500" strokeWidth="1.6" />
        {ties.map((i) => {
          const t = i / 31;
          const x = 320 + t * 870;
          const y = 700 - t * 200;
          const dx = -200, dy = 870;
          const len = Math.hypot(dx, dy);
          const nx = (dx / len) * 5;
          const ny = (dy / len) * 5;
          return (
            <line key={i} x1={x - nx} y1={y - ny} x2={x + nx} y2={y + ny} strokeWidth="1.2" />
          );
        })}
      </g>

      <Town x={500} y={220} label="FORT KILO" />
      <Town x={900} y={380} label="RIDGE STN." />
      <Town x={680} y={620} label="ECHO BASE" />
      <Town x={1100} y={460} label="DELTA POST" />
      <Town x={420} y={620} label="OUTPOST 7" />

      <g transform="translate(1080, 130)">
        <circle r="44" fill="rgba(252,245,220,0.32)" stroke="#3a2818" strokeWidth="1" />
        <circle r="44" fill="none" stroke="#3a2818" strokeWidth="0.4" strokeDasharray="2 4" />
        <polygon points="40,0 0,4 -40,0 0,-4" fill="#3a2818" opacity="0.45" />
        <polygon points="0,-40 4,0 0,40 -4,0" fill="#3a2818" />
        <polygon points="0,-40 0,0 4,0" fill="#a82a1f" />
        <text y="-50" textAnchor="middle" fontSize="11" fontFamily="Oswald, sans-serif" fontWeight="800" fill="#3a2818">N</text>
        <text y="58" textAnchor="middle" fontSize="11" fontFamily="Oswald, sans-serif" fontWeight="800" fill="#3a2818">S</text>
        <text x="50" y="3" fontSize="10" fontFamily="Oswald, sans-serif" fontWeight="700" fill="#3a2818">E</text>
        <text x="-58" y="3" fontSize="10" fontFamily="Oswald, sans-serif" fontWeight="700" fill="#3a2818">W</text>
      </g>

      <g transform="translate(60, 730)">
        <rect width="22" height="7" fill="#1a0e08" />
        <rect x="22" width="22" height="7" fill="#e8d8a8" stroke="#1a0e08" strokeWidth="0.5" />
        <rect x="44" width="22" height="7" fill="#1a0e08" />
        <rect x="66" width="22" height="7" fill="#e8d8a8" stroke="#1a0e08" strokeWidth="0.5" />
        <rect x="88" width="22" height="7" fill="#1a0e08" />
        <text x="0" y="22" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#3a2818" letterSpacing="1">0</text>
        <text x="44" y="22" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#3a2818" letterSpacing="1">2</text>
        <text x="88" y="22" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#3a2818" letterSpacing="1">4 KM</text>
      </g>

      <g transform="translate(880, 720)">
        <rect width="280" height="48" fill="rgba(60,40,20,0.86)" stroke="#1a0e08" />
        <rect x="6" y="6" width="268" height="36" fill="none" stroke="#e8d8a8" strokeWidth="0.5" />
        <text x="20" y="22" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="#cdb87a" letterSpacing="2">SHEET 7G · 1:50,000</text>
        <text x="20" y="38" fontSize="13" fontFamily="Oswald, sans-serif" fontWeight="800" fill="#e8d8a8" letterSpacing="3">OP. ARTILLERY</text>
      </g>

      <g stroke="rgba(0,0,0,0.18)" strokeWidth="1" fill="none">
        <line x1="600" y1="0" x2="600" y2="800" />
        <line x1="0" y1="400" x2="1200" y2="400" />
      </g>

      <g fill="rgba(168,42,31,0.6)" fontFamily="Oswald, sans-serif" fontSize="10" fontWeight="700" letterSpacing="2">
        <text x="640" y="480" transform="rotate(-12 640 480)">FRIENDLY</text>
        <text x="940" y="260" transform="rotate(-8 940 260)">SECTOR III</text>
      </g>
    </svg>
  );
}

function Town({ x, y, label }: { x: number; y: number; label: string }): JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill="#a82a1f" stroke="#1a0e08" strokeWidth="0.8" />
      <circle cx={x} cy={y} r="2.4" fill="#1a0e08" />
      <text x={x + 12} y={y + 4} fontSize="11" fontFamily="Oswald, sans-serif" fontWeight="700" fill="#3a2818" letterSpacing="2">{label}</text>
    </g>
  );
}

export function PlayPage({ navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem("artillery:guestName") ?? "",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [lobbies, setLobbies] = useState<LobbySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const ensureName = (): boolean => {
    if (session) return true;
    const cleaned = guestName.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleaned)) {
      setError("Engrave a callsign first (3–16 letters, numbers, or underscores).");
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
    <div className="war-table">
      <div className="map-paper" aria-hidden>
        <MapSvg />
        <span className="map-stain" />
      </div>
      <span className="map-tack map-tack-tl" aria-hidden />
      <span className="map-tack map-tack-tr" aria-hidden />
      <span className="map-tack map-tack-bl" aria-hidden />
      <span className="map-tack map-tack-br" aria-hidden />

      <div className="war-table-inner">

      {error && <div className="error war-error">{error}</div>}

      <div className="war-cols">
        <aside className="war-col-left">
          {!session && (
            <DogTag
              value={guestName}
              onChange={setGuestName}
              valid={validGuest}
              error={showGuestError}
            />
          )}

          <button
            className="op-pad"
            onClick={createLobby}
            type="button"
          >
            <span className="op-pad-perf" aria-hidden />
            <span className="op-pad-stamp">DEPLOY</span>
            <span className="op-pad-eyebrow">FORM 7G — OPERATION ORDER</span>
            <span className="op-pad-title">Create Game</span>
            <span className="op-pad-blurb">
              FFA, team battle, ranked or casual. Tear off the top sheet to
              plant a fresh pin on the map.
            </span>
            <span className="op-pad-cta">Tear off &amp; deploy →</span>
          </button>

          <div className="envelope">
            <span className="envelope-flap" aria-hidden />
            <span className="envelope-wax" aria-hidden>★</span>
            <span className="envelope-stamp" aria-hidden>PRIVATE</span>
            <div className="envelope-postmark">02 · GOT AN INVITE?</div>
            <div className="envelope-row">
              <label htmlFor="invite-code-input">Invite code</label>
              <input
                id="invite-code-input"
                className="envelope-input envelope-input-code"
                placeholder="XXXXXX"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>
            <div className="envelope-row">
              <label htmlFor="invite-pass-input">Wax seal</label>
              <input
                id="invite-pass-input"
                className="envelope-input envelope-input-pass"
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
              className="primary-btn envelope-deploy"
              disabled={inviteCode.trim().length < 4}
              onClick={joinInvite}
            >
              Slit open &amp; Deploy
            </SfxButton>
          </div>

        </aside>

        <section className="pinboard war-col-right">
        <header className="pinboard-head">
          <div>
            <div className="pinboard-eyebrow">03 · ACTIVE OPERATIONS</div>
            <h2>Pins on the Map</h2>
          </div>
        </header>

        {lobbies === null ? (
          <p className="ops-muted">Receiving telemetry…</p>
        ) : lobbies.length === 0 ? (
          <div className="pinboard-empty">
            <span className="pinboard-empty-pin" aria-hidden />
            <div>
              <div className="pinboard-empty-title">Map is bare.</div>
              <div className="pinboard-empty-blurb">
                Tear off an Operation Order and you'll be the first pin on
                the table.
              </div>
            </div>
          </div>
        ) : (
          <ul className="pin-grid">
            {lobbies.map((r) => {
              const biome = BIOMES[r.biome as BiomeId];
              const full = r.currentPlayers >= r.maxPlayers;
              const isPrivate = r.visibility === "private";
              const inProgress = r.inProgress;
              const canRejoin =
                inProgress &&
                !!session?.user.id &&
                r.participantUserIds.includes(session.user.id);
              const stripeColor = biome
                ? `#${biome.grass.toString(16).padStart(6, "0")}`
                : "var(--ink-faint)";
              const age = relativeTime(r.createdAt, nowTick);
              const buttonLabel = canRejoin
                ? "Rejoin"
                : inProgress
                ? "In Progress"
                : isPrivate
                ? "Locked"
                : full
                ? "Full"
                : "Join";
              const buttonDisabled =
                (inProgress && !canRejoin) ||
                (!inProgress && (full || isPrivate));
              const tilt = ((hashStr(r.roomId) % 7) - 3) * 0.6;
              const coord = coordFor(r.roomId);
              return (
                <li
                  key={r.roomId}
                  className={`pin-card ${isPrivate ? "private" : ""} ${inProgress ? "in-progress" : ""}`}
                  style={{
                    ["--tilt" as string]: `${tilt}deg`,
                    ["--pin-color" as string]: isPrivate ? "var(--ink-faint)" : stripeColor,
                  }}
                >
                  <span
                    className="pin-card-pin"
                    aria-hidden
                  />
                  {isPrivate && <span className="pin-card-string" aria-hidden />}
                  <div className="pin-card-coord">{coord}</div>
                  <div className="pin-card-count">
                    <span className="pin-card-count-num">{r.currentPlayers}</span>
                    <span className="pin-card-count-sep">/</span>
                    <span className="pin-card-count-cap">{r.maxPlayers}</span>
                  </div>
                  <div className="pin-card-body">
                    <div className="pin-card-name">
                      {r.lobbyName || "Lobby"}
                      {isPrivate && <span className="lobby-chip private">PRIVATE</span>}
                      {r.ranked && <span className="lobby-chip ranked">RANKED</span>}
                      {inProgress && <span className="lobby-chip muted">IN PROGRESS</span>}
                      {!isPrivate && !inProgress && full && <span className="lobby-chip muted">FULL</span>}
                    </div>
                    <div className="pin-card-meta">
                      {r.hostName ? <>Host <strong>{r.hostName}</strong></> : "—"}
                      {" · "}
                      {biome?.label ?? (r.biome || "Mystery")}
                      {" · "}
                      <span className="pin-card-age">{age}</span>
                      {r.participantNames.length > 0 && (
                        <>
                          {" · "}
                          <span className="pin-card-roster" title={r.participantNames.join(", ")}>
                            {r.participantNames.slice(0, 3).join(", ")}
                            {r.participantNames.length > 3 && ` +${r.participantNames.length - 3}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <SfxButton
                    className={`pin-card-cta ${canRejoin ? "primary-btn" : isPrivate ? "ghost-btn" : "secondary-btn"}`}
                    disabled={buttonDisabled}
                    onClick={() => joinLobby(r.roomId)}
                    title={
                      isPrivate
                        ? "Private lobby — needs an invite code"
                        : inProgress && !canRejoin
                        ? "This match is in progress and you weren't part of it"
                        : undefined
                    }
                  >
                    {buttonLabel}
                  </SfxButton>
                </li>
              );
            })}
          </ul>
        )}
        </section>
      </div>
      </div>
    </div>
  );
}

interface DogTagProps {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  error: boolean;
}

function DogTag({ value, onChange, valid, error }: DogTagProps): JSX.Element {
  return (
    <div className={`dogtag ${error ? "errored" : ""} ${valid ? "ok" : ""}`}>
      <span className="dogtag-hole" aria-hidden />
      <span className="dogtag-bead" aria-hidden />
      <label htmlFor="callsign-input" className="dogtag-lbl">Engrave callsign</label>
      <input
        id="callsign-input"
        className="dogtag-input"
        data-callsign-field
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="A–Z 0–9 _"
        maxLength={16}
      />
      <span className="dogtag-status">{valid ? "READY" : "NEEDED"}</span>
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

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function coordFor(roomId: string): string {
  const h = hashStr(roomId);
  const col = COORD_COLS[h % COORD_COLS.length]!;
  const row = String(((h >> 5) % 7) + 1).padStart(2, "0");
  return `${col}-${row}`;
}
