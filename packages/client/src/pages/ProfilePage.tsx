import { useEffect, useRef, useState } from "react";
import { api } from "../auth/authClient";
import type { PublicProfile } from "@artillery/shared";
import type { Route } from "../router";
import { useAuth } from "../auth/AuthProvider";
import { loadLoadout } from "../game/loadoutStorage";
import { renderLoadoutCanvas } from "../game/tankPreview";

interface Props {
  username: string;
  navigate: (r: Route) => void;
}

interface Rank {
  name: string;
  min: number;
  next: number;
  color: string;
  icon: string;
}

const RANKS: Rank[] = [
  { name: "Recruit",    min: 0,    next: 900,  color: "#8a8477", icon: "/icons/ranks/shield.svg" },
  { name: "Private",    min: 900,  next: 1100, color: "#a8a070", icon: "/icons/ranks/private.svg" },
  { name: "Corporal",   min: 1100, next: 1300, color: "#b8a050", icon: "/icons/ranks/corporal.svg" },
  { name: "Sergeant",   min: 1300, next: 1500, color: "#d49228", icon: "/icons/ranks/sergeant.svg" },
  { name: "Lieutenant", min: 1500, next: 1700, color: "#e07845", icon: "/icons/ranks/lieutenant.svg" },
  { name: "Captain",    min: 1700, next: 1900, color: "#e85c25", icon: "/icons/ranks/captain.svg" },
  { name: "Major",      min: 1900, next: 2100, color: "#c03a3a", icon: "/icons/ranks/major.svg" },
  { name: "Colonel",    min: 2100, next: 2400, color: "#9d2a7a", icon: "/icons/ranks/colonel.svg" },
  { name: "General",    min: 2400, next: 2400, color: "#ffd25e", icon: "/icons/ranks/general.svg" },
];

function rankFor(mmr: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (mmr >= RANKS[i]!.min) return RANKS[i]!;
  }
  return RANKS[0]!;
}

interface Medal {
  id: string;
  name: string;
  blurb: string;
  earned: boolean;
  iconUrl: string; // path to CC-BY icon in /public/icons/medals/
}

function medalsFor(p: PublicProfile): Medal[] {
  const winRate = p.wins + p.losses > 0 ? p.wins / (p.wins + p.losses) : 0;
  return [
    { id: "first",    name: "First Blood",     blurb: "Confirmed kill",            earned: p.kills >= 1,    iconUrl: "/icons/medals/crosshair.svg" },
    { id: "iron",     name: "Iron Fist",       blurb: "10 kills",                  earned: p.kills >= 10,   iconUrl: "/icons/medals/crossed-swords.svg" },
    { id: "apex",     name: "Apex Predator",   blurb: "50 kills",                  earned: p.kills >= 50,   iconUrl: "/icons/medals/medal-skull.svg" },
    { id: "veteran",  name: "Veteran",         blurb: "10 matches survived",       earned: p.matches >= 10, iconUrl: "/icons/medals/ribbon-medal.svg" },
    { id: "ace",      name: "Triple Ace",      blurb: "50 matches",                earned: p.matches >= 50, iconUrl: "/icons/medals/star-medal.svg" },
    { id: "win-rate", name: "Decorated",       blurb: "≥60% win rate · 10+ games", earned: winRate >= 0.6 && p.matches >= 10, iconUrl: "/icons/medals/medallist.svg" },
    { id: "top",      name: "Top of the List", blurb: "≥1600 MMR",                 earned: p.mmr >= 1600,   iconUrl: "/icons/medals/medal.svg" },
  ];
}

export function ProfilePage({ username, navigate }: Props): JSX.Element {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const { session } = useAuth();
  const isSelf = session?.user.username === username;

  useEffect(() => {
    if (!username) return;
    setProfile(null);
    setError(null);
    setIsDemo(false);
    api.profile(username)
      .then((r) => setProfile(r.profile))
      .catch((err) => {
        // Operators shown on the padded leaderboard don't exist in the DB.
        // Rather than 404-ing, synthesize a profile from the username hash
        // so the card still renders with tank + stats for design preview.
        const msg = String(err?.message ?? "").toLowerCase();
        if (msg.includes("not found") || msg.includes("404")) {
          setProfile(syntheticProfile(username));
          setIsDemo(true);
        } else {
          setError(err?.message ?? "Failed to load");
        }
      });
  }, [username]);

  if (!username) {
    return (
      <div className="container">
        <div className="card">
          <h2>No profile selected</h2>
          <button className="secondary-btn" onClick={() => navigate({ name: "leaderboard" })}>
            Browse leaderboard
          </button>
        </div>
      </div>
    );
  }

  if (error) return <div className="container"><div className="card"><div className="error">{error}</div></div></div>;
  if (!profile) return <div className="container"><div className="card"><p style={{ color: "var(--ink-dim)" }}>Loading service record…</p></div></div>;

  const rank = rankFor(profile.mmr);
  const prevRank = RANKS[Math.max(0, RANKS.indexOf(rank) - 1)]!;
  const toNext = Math.max(0, rank.next - profile.mmr);
  const progress = Math.max(0, Math.min(1, (profile.mmr - rank.min) / Math.max(1, rank.next - rank.min)));
  const totalGames = profile.wins + profile.losses;
  const winRate = totalGames > 0 ? profile.wins / totalGames : 0;
  const kd = profile.deaths > 0 ? profile.kills / profile.deaths : profile.kills;
  const medals = medalsFor(profile);

  return (
    <div className="container">
      <div className="card service-record">
        <div className="service-record-head">
          <div className="dogtag">
            <span className="service-label">Service Record · SN-{profile.id.slice(0, 8).toUpperCase()}</span>
            <h1 className="codename">{profile.username}</h1>
            <div className="rank-row">
              <span className="rank-chip" style={{ borderColor: rank.color, color: rank.color }}>
                <span
                  className="rank-icon icon-mask"
                  style={{
                    background: rank.color,
                    WebkitMaskImage: `url(${rank.icon})`,
                    maskImage: `url(${rank.icon})`,
                  }}
                />
                {rank.name}
              </span>
              <span className="rank-mmr">{profile.mmr} <span className="rank-mmr-lbl">MMR</span></span>
            </div>
            <div className="rank-progress">
              <div className="rank-progress-bar">
                <div style={{ width: `${progress * 100}%`, background: rank.color }} />
              </div>
              <div className="rank-progress-labels">
                <span>{prevRank.name}</span>
                <span>{toNext > 0 ? `${toNext} MMR → ${RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(rank) + 1)]!.name}` : "MAX RANK"}</span>
              </div>
            </div>
          </div>
          <div className="dogtag-stamp">
            ENLISTED · {new Date(profile.createdAt).getFullYear()}
            {isDemo && <><br /><span style={{ color: "var(--rust-bright)", fontSize: 10 }}>DEMO OPERATOR</span></>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{isSelf ? "My Vehicle" : `${profile.username}'s Vehicle`}</h2>
        {isSelf
          ? <SelfVehicleCard />
          : <OperatorVehicleCard username={profile.username} />}
        {isSelf && (
          <div style={{ marginTop: 10 }}>
            <button
              className="secondary-btn"
              onClick={() => navigate({ name: "customize" })}
              style={{ width: "auto", padding: "10px 20px" }}
            >
              Edit loadout
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Combat Record</h2>
        <div className="combat-grid">
          <CombatTile big label="Matches" value={profile.matches} />
          <CombatTile big label="Win Rate" value={`${Math.round(winRate * 100)}%`} accent={winRate >= 0.5 ? "ok" : "warn"} />
          <CombatTile big label="Kills" value={profile.kills} accent="amber" />
          <CombatTile big label="K / D" value={kd.toFixed(2)} accent={kd >= 1 ? "ok" : "bad"} />
          <CombatTile label="Wins" value={profile.wins} />
          <CombatTile label="Losses" value={profile.losses} />
          <CombatTile label="Deaths" value={profile.deaths} />
          <CombatTile label="Enlisted" value={new Date(profile.createdAt).toLocaleDateString()} />
        </div>
      </div>

      <div className="card">
        <h2>Commendations</h2>
        <div className="medal-grid">
          {medals.map((m) => (
            <div key={m.id} className={`medal ${m.earned ? "earned" : "locked"}`}>
              <div className="medal-icon">
                <span
                  className="icon-mask"
                  style={{
                    width: 32, height: 32,
                    background: m.earned ? "#ffd49a" : "#4a4a4a",
                    WebkitMaskImage: `url(${m.iconUrl})`,
                    maskImage: `url(${m.iconUrl})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    display: "inline-block",
                  }}
                />
              </div>
              <div className="medal-body">
                <div className="medal-name">{m.name}</div>
                <div className="medal-blurb">{m.blurb}</div>
              </div>
              <div className="medal-status">{m.earned ? "AWARDED" : "LOCKED"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Deterministic pseudo-loadout derived from a username — same technique
// the leaderboard uses so every operator has a distinct silhouette even
// when the server doesn't persist public loadouts yet.
const OP_BODIES = ["heavy", "light", "assault"] as const;
const OP_TURRETS = ["standard", "angular", "low"] as const;
const OP_BARRELS = ["standard", "heavy", "long"] as const;
const OP_FIELD_COLORS = [
  0x3a2e1b, 0x4a3d28, 0x2e3a22, 0x1f2b1a, 0x2c2823,
  0x5a2a1e, 0x38363a, 0x6b3d1a, 0x1a2430, 0x211515,
];
const OP_ACCENTS = [
  0xb28a3d, 0x8a6a1a, 0x6a2820, 0x2e3a22, 0xb7a78a, 0x3a2010, 0x5a5a55,
];

/** Build a fake PublicProfile from a username hash so the leaderboard's
 *  synthetic roster slots still open a viewable profile instead of
 *  dead-ending on a 404. Stats, MMR, matches etc. all vary per username
 *  so the preview looks alive. */
function syntheticProfile(username: string): PublicProfile {
  const h = opHash(username);
  const mmr = 900 + (h % 1800);
  const matches = 50 + ((h >> 3) % 260);
  const wins = Math.round(matches * (0.3 + ((h >> 6) & 0x1f) / 80));
  const losses = Math.max(0, matches - wins);
  const kills = 80 + ((h >> 9) % 320);
  const deaths = Math.max(1, ((h >> 12) % 200) + 10);
  return {
    id: `demo-${(h >>> 0).toString(16)}`,
    username,
    mmr,
    wins,
    losses,
    kills,
    deaths,
    matches,
    createdAt: new Date(Date.now() - ((h >> 15) % 365) * 86400000).toISOString(),
  };
}

function opHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

const OP_PATTERNS = ["solid", "stripes", "tiger", "digital", "chevron"] as const;
const OP_DECALS = ["none", "number", "star", "skull", "crosshair"] as const;
const OP_PATTERN_COLORS = [0x1a140c, 0x0a0a10, 0x3a2a18, 0x1f1a12];

function loadoutFromUsername(username: string): ReturnType<typeof loadLoadout> {
  const h = opHash(username);
  return {
    body: OP_BODIES[h % OP_BODIES.length]!,
    turret: OP_TURRETS[(h >> 3) % OP_TURRETS.length]!,
    barrel: OP_BARRELS[(h >> 6) % OP_BARRELS.length]!,
    pattern: OP_PATTERNS[(h >> 15) % OP_PATTERNS.length]!,
    decal: OP_DECALS[(h >> 18) % OP_DECALS.length]!,
    primaryColor: OP_FIELD_COLORS[(h >> 9) % OP_FIELD_COLORS.length]!,
    accentColor: OP_ACCENTS[(h >> 12) % OP_ACCENTS.length]!,
    patternColor: OP_PATTERN_COLORS[(h >> 21) % OP_PATTERN_COLORS.length]!,
  } as ReturnType<typeof loadLoadout>;
}

function OperatorVehicleCard({ username }: { username: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 360, H = 220;
  const l = loadoutFromUsername(username);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProfileTank(ctx, W, H, l);
  }, [username]);
  return (
    <div className="self-vehicle">
      <canvas ref={ref} className="tank-plate big" style={{ width: W, height: H }} />
      <div className="self-vehicle-spec">
        <div><strong>HULL</strong> {l.body}</div>
        <div><strong>TURRET</strong> {l.turret}</div>
        <div><strong>BARREL</strong> {l.barrel}</div>
      </div>
    </div>
  );
}

function SelfVehicleCard(): JSX.Element {
  const l = loadLoadout();
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 360, H = 220;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProfileTank(ctx, W, H, l);
  }, [l.body, l.turret, l.barrel, l.primaryColor, l.accentColor]);
  return (
    <div className="self-vehicle">
      <canvas ref={ref} className="tank-plate big" style={{ width: W, height: H }} />
      <div className="self-vehicle-spec">
        <div><strong>HULL</strong> {l.body}</div>
        <div><strong>TURRET</strong> {l.turret}</div>
        <div><strong>BARREL</strong> {l.barrel}</div>
      </div>
    </div>
  );
}

function drawProfileTank(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  l: ReturnType<typeof loadLoadout>,
): void {
  renderLoadoutCanvas(ctx, {
    width: w,
    height: h,
    bodyStyle: l.body,
    turretStyle: l.turret,
    barrelStyle: l.barrel,
    primary: `#${l.primaryColor.toString(16).padStart(6, "0")}`,
    accent:  `#${l.accentColor.toString(16).padStart(6, "0")}`,
    pattern: l.pattern,
    patternColor: `#${l.patternColor.toString(16).padStart(6, "0")}`,
    decal: l.decal,
    showDeck: true,
  });
}

function CombatTile({
  label, value, accent, big,
}: {
  label: string;
  value: string | number;
  accent?: "ok" | "bad" | "warn" | "amber";
  big?: boolean;
}) {
  const color =
    accent === "ok" ? "var(--ok)"
    : accent === "bad" ? "var(--danger)"
    : accent === "warn" ? "var(--warn)"
    : accent === "amber" ? "var(--amber-bright)"
    : "var(--ink)";
  return (
    <div className={`combat-tile ${big ? "big" : ""}`}>
      <div className="combat-label">{label}</div>
      <div className="combat-value" style={{ color }}>{value}</div>
    </div>
  );
}
