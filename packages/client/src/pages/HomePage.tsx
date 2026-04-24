import { useEffect, useMemo, useState } from "react";
import type { Route } from "../router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/authClient";
import { SfxButton } from "../ui/SfxButton";
import { click } from "../ui/sfx";
import {
  ALL_BIOMES,
  BIOMES,
  type BiomeId,
  type LeaderboardEntry,
  type MatchSummary,
  WEAPONS,
  DEFAULT_LOADOUT,
  type WeaponId,
} from "@artillery/shared";
import { WeaponIcon } from "../ui/WeaponIcon";

interface Props { navigate: (r: Route) => void; }

/**
 * Operations Command — a tactical dashboard instead of a website hero.
 * Commander's dossier, live intel feed, weather briefing, radar, recent
 * engagements, and a single dominant DEPLOY CTA.
 */
export function HomePage({ navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [top, setTop] = useState<LeaderboardEntry[] | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [briefing] = useState(() => generateBriefing());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    api.recentMatches(6).then((r) => setMatches(r.matches)).catch(() => undefined);
    api.leaderboard(5).then((r) => setTop(r.entries)).catch(() => undefined);
  }, []);

  const featuredWeapon = useMemo(() => {
    const keys = DEFAULT_LOADOUT as WeaponId[];
    return keys[Math.floor(Math.random() * keys.length)]!;
  }, []);

  return (
    <div className="ops">
      <div className="ops-grid">
        <div className="ops-card ops-briefing">
          <OpsHeader label="01 · Commander Briefing" live />
          <div className="commander">
            <div className="avatar"><Radar /></div>
            <div className="commander-info">
              <div className="callsign-label">CALLSIGN</div>
              <div className="callsign">{session ? session.user.username : "GUEST OPERATOR"}</div>
              <div className="commander-row">
                <Chip label="RANK" value={session ? rankName(session.user.mmr) : "Recruit"} />
                <Chip label="MMR" value={session ? `${session.user.mmr}` : "—"} accent />
                <Chip label="KILLS" value={session ? `${session.user.kills}` : "—"} />
                <Chip label="WINS" value={session ? `${session.user.wins}` : "—"} />
              </div>
              <div className="readiness">
                <ReadinessBar value={session ? readinessFor(session.user.mmr) : 0.45} />
                <span>FIT FOR DUTY</span>
              </div>
            </div>
          </div>
          <div className="orders">
            <div className="orders-label">TODAY'S ORDERS</div>
            <div className="orders-body">
              {session
                ? `Operator ${session.user.username}, situation report indicates hostile activity across ${briefing.biomeLabel}. Winds ${briefing.windLabel}. Engage with discretion.`
                : "Unregistered operator. Enlist to log kills, climb MMR, and be remembered."}
            </div>
          </div>
        </div>

        <div className="ops-card ops-deploy">
          <OpsHeader label="02 · Deployment" />
          <div className="deploy-big">
            <SfxButton
              className="primary-btn deploy-cta"
              onClick={() => navigate({ name: "play" })}
            >
              ▲ DEPLOY TO BATTLE
            </SfxButton>
            <div className="deploy-row">
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
            <div className="deploy-note">
              <Pulse /> {session ? "STATUS · READY" : "STATUS · GUEST"} · CLEARANCE GRANTED
            </div>
          </div>
        </div>

        <div className="ops-card ops-weather">
          <OpsHeader label="03 · Weather Briefing" />
          <div className="weather-body">
            <div className="weather-main">
              <div className="weather-label">FORECASTED THEATER</div>
              <div className="weather-theater" style={{ color: biomeColor(briefing.biome) }}>
                {briefing.biomeLabel.toUpperCase()}
              </div>
              <div className="weather-blurb">{BIOMES[briefing.biome].blurb}</div>
            </div>
            <div className="weather-wind">
              <WindDial wind={briefing.wind} />
              <div className="weather-label">WIND · {briefing.wind >= 0 ? "EAST" : "WEST"}</div>
            </div>
          </div>
        </div>

        <div className="ops-card ops-weapon">
          <OpsHeader label="04 · Featured Ordnance" />
          <div className="weapon-feature">
            <div className="weapon-big" style={{ color: `#${WEAPONS[featuredWeapon].tint.toString(16).padStart(6, "0")}` }}>
              <WeaponIcon weapon={featuredWeapon} size={74} color="currentColor" />
            </div>
            <div className="weapon-info">
              <div className="weapon-name">{WEAPONS[featuredWeapon].name}</div>
              <div className="weapon-stats">
                <Stat k="DMG" v={`${WEAPONS[featuredWeapon].damage}`} />
                <Stat k="RAD" v={`${WEAPONS[featuredWeapon].radius}`} />
              </div>
              <div className="weapon-blurb">{WEAPONS[featuredWeapon].blurb}</div>
            </div>
          </div>
        </div>

        <div className="ops-card ops-clock">
          <OpsHeader label="05 · Ops Time" />
          <div className="clock">
            <div className="clock-time">{fmtClock(clock)}</div>
            <div className="clock-date">{fmtDate(clock)}</div>
            <div className="clock-sector">SECTOR 7G · COMMS OPEN</div>
            <div className="scanline" />
          </div>
        </div>

        <div className="ops-card ops-intel">
          <OpsHeader label="06 · Intel Feed" live />
          <IntelFeed
            key={session?.user.username ?? "guest"}
            matches={matches}
            session={session?.user.username ?? null}
          />
        </div>

        <div className="ops-card ops-engagements">
          <OpsHeader label="07 · Recent Engagements" />
          {matches === null ? (
            <p className="ops-muted">Receiving telemetry…</p>
          ) : matches.length === 0 ? (
            <p className="ops-muted">No recorded engagements. Be the first.</p>
          ) : (
            <ul className="engagement-list">
              {matches.slice(0, 5).map((m) => (
                <li key={m.id} onClick={() => { click(); navigate({ name: "leaderboard" }); }}>
                  <span className="eng-mode">{m.mode.toUpperCase()}</span>
                  <span className="eng-victor">{m.winnerUsername ?? "STALEMATE"}</span>
                  <span className="eng-score">{m.participants.length} ops</span>
                  <span className="eng-time">{relativeTime(m.endedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ops-card ops-brass">
          <OpsHeader label="08 · Ranking Officers" />
          {top === null ? (
            <p className="ops-muted">Receiving telemetry…</p>
          ) : top.length === 0 ? (
            <p className="ops-muted">No ranked operators yet.</p>
          ) : (
            <ul className="brass-list">
              {top.map((e) => (
                <li key={e.rank}>
                  <span className={`brass-rank rank-${e.rank}`}>#{e.rank}</span>
                  <span className="brass-name">{e.username}</span>
                  <span className="brass-mmr">{e.mmr}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── subcomponents ───────────────────────── */

function OpsHeader({ label, live }: { label: string; live?: boolean }) {
  return (
    <div className="ops-header">
      <span>{label}</span>
      {live && (
        <span className="ops-live">
          <Pulse /> LIVE
        </span>
      )}
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`chip ${accent ? "accent" : ""}`}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="statlet">
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

function Pulse() {
  return <span className="pulse-dot" aria-hidden />;
}

function ReadinessBar({ value }: { value: number }) {
  return (
    <div className="readiness-bar">
      <div style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
    </div>
  );
}

function Radar(): JSX.Element {
  return (
    <svg viewBox="0 0 100 100" className="radar">
      <defs>
        <radialGradient id="rad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2a1d10" />
          <stop offset="100%" stopColor="#0a0604" />
        </radialGradient>
        <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(180,220,140,0.0)" />
          <stop offset="100%" stopColor="rgba(180,220,140,0.55)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#rad)" stroke="rgba(208,120,60,0.4)" strokeWidth="1" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(208,120,60,0.2)" />
      <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(208,120,60,0.2)" />
      <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(208,120,60,0.12)" />
      <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(208,120,60,0.12)" />
      <g className="radar-sweep">
        <path d="M50,50 L50,2 A48,48 0 0,1 96,56 Z" fill="url(#sweep)" opacity="0.7" />
      </g>
      <circle cx="68" cy="34" r="1.6" fill="#ffbe52" />
      <circle cx="34" cy="62" r="1.6" fill="#ffbe52" />
      <circle cx="58" cy="72" r="1.6" fill="#ffbe52" />
      <circle cx="50" cy="50" r="2" fill="#ff6b3a" />
    </svg>
  );
}

function WindDial({ wind }: { wind: number }) {
  const mag = Math.min(1, Math.abs(wind) / 25);
  return (
    <svg viewBox="0 0 80 80" className="wind-dial">
      <circle cx="40" cy="40" r="38" fill="rgba(0,0,0,0.5)" stroke="rgba(208,120,60,0.4)" />
      <circle cx="40" cy="40" r="26" fill="none" stroke="rgba(208,120,60,0.18)" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x1 = 40 + Math.cos(a) * 32;
        const y1 = 40 + Math.sin(a) * 32;
        const x2 = 40 + Math.cos(a) * 36;
        const y2 = 40 + Math.sin(a) * 36;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(208,120,60,0.5)" />;
      })}
      <g style={{ transform: `rotate(${wind >= 0 ? 0 : 180}deg)`, transformOrigin: "40px 40px" }}>
        <polygon
          points={`36,${34 - mag * 20} 44,${34 - mag * 20} 40,${16 - mag * 24}`}
          fill="#ffbe52"
        />
        <circle cx="40" cy="40" r="4" fill="#ffbe52" />
      </g>
      <text x="40" y="68" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#ffd49a">
        {Math.round(Math.abs(wind))}
      </text>
    </svg>
  );
}

function IntelFeed({
  matches, session,
}: { matches: MatchSummary[] | null; session: string | null }) {
  const lines = useMemo(() => {
    const base: string[] = [
      "▸ Combat readiness: 92% across fielded units.",
      "▸ Cluster-bomb yield up 4% after latest fuse revision.",
      "▸ Wind shear advisory issued for Ashen Crater theater.",
      "▸ Bot squadron performance evaluated at 1200 baseline.",
      "▸ Airstrike flight paths cleared. Vector: grid 7G.",
      "▸ Supply lines stable. Fuel reserves full.",
      "▸ MIRV kinetic tests show acceptable scatter.",
      "▸ Napalm dispersal rounds cleared for field use.",
    ];
    if (session) base.unshift(`▸ Operator ${session} logged into command network.`);
    if (matches && matches.length > 0) {
      for (const m of matches.slice(0, 4)) {
        if (m.winnerUsername) base.unshift(`▸ ${m.winnerUsername} took the hill on ${m.mode.toUpperCase()}.`);
      }
    }
    return base;
  }, [matches, session]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % lines.length), 3500);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <div className="intel">
      <div className="intel-line" key={idx}>{lines[idx]}</div>
      <div className="intel-ticker">
        {lines.slice(0, 6).map((l, i) => (
          <div key={i} className={i === idx ? "current" : ""}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function generateBriefing(): { biome: BiomeId; biomeLabel: string; wind: number; windLabel: string } {
  const biome = ALL_BIOMES[Math.floor(Math.random() * ALL_BIOMES.length)]!;
  const wind = (Math.random() * 2 - 1) * 18;
  const label =
    Math.abs(wind) < 5 ? "calm"
    : Math.abs(wind) < 12 ? "moderate"
    : "strong";
  return { biome, biomeLabel: BIOMES[biome].label, wind, windLabel: `${label} ${wind >= 0 ? "eastward" : "westward"}` };
}

function biomeColor(b: BiomeId): string {
  return "#" + BIOMES[b].grass.toString(16).padStart(6, "0");
}

function rankName(mmr: number): string {
  if (mmr >= 2400) return "General";
  if (mmr >= 2100) return "Colonel";
  if (mmr >= 1900) return "Major";
  if (mmr >= 1700) return "Captain";
  if (mmr >= 1500) return "Lieutenant";
  if (mmr >= 1300) return "Sergeant";
  if (mmr >= 1100) return "Corporal";
  if (mmr >= 900) return "Private";
  return "Recruit";
}

function readinessFor(mmr: number): number {
  return Math.max(0.2, Math.min(1, mmr / 2400));
}

function fmtClock(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
