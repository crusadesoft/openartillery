import { useEffect, useRef, useState } from "react";
import { api } from "../auth/authClient";
import type { LeaderboardEntry } from "@artillery/shared";
import type { Route } from "../router";
import { click } from "../ui/sfx";
import {
  renderLoadoutCanvas,
  type BarrelStyle,
  type BodyStyle,
  type DecalStyle,
  type PatternStyle,
  type TurretStyle,
} from "../game/tankPreview";
import { rankFor } from "../game/ranks";

interface Props { navigate: (r: Route) => void; }

interface EntryDisplay extends LeaderboardEntry {
  vehicle: {
    body: string;
    turret: string;
    barrel: string;
    primary: number;
    accent: number;
    pattern?: string;
    patternColor?: number;
    decal?: string;
  };
  rankName: string;
  rankColor: string;
  rankIcon: string;
  /** Synthetic roster padding — can't route to a backend profile. */
  demo?: boolean;
}


// Leaderboard-level deterministic pseudo-loadout generator so every operator
// reads as a distinct silhouette even if the server doesn't persist the
// authed user's saved loadout yet. Keeps the visuals varied + inviting.
const BODIES = [
  "heavy", "light", "assault", "scout", "siege",
  "bunker", "recon", "speeder",
] as const;
const TURRETS = [
  "standard", "angular", "low", "wedge", "dome",
  "box", "tall", "twin",
] as const;
const BARRELS = [
  "standard", "heavy", "long", "sniper", "stubby",
  "mortar", "twin", "rail",
] as const;
const FIELD_COLORS = [
  0x3a2e1b, 0x4a3d28, 0x2e3a22, 0x1f2b1a, 0x2c2823,
  0x5a2a1e, 0x38363a, 0x6b3d1a, 0x1a2430, 0x211515,
];
const ACCENTS = [
  0xb28a3d, 0x8a6a1a, 0x6a2820, 0x2e3a22, 0xb7a78a, 0x3a2010, 0x5a5a55,
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const PATTERNS = [
  "solid", "stripes", "tiger", "digital", "chevron",
  "splinter", "urban", "hex",
] as const;
const DECALS = [
  "none", "number", "star", "skull", "crosshair",
  "cross", "flame", "shield",
] as const;
const PATTERN_COLORS = [0x1a140c, 0x0a0a10, 0x3a2a18, 0x1f1a12];

function vehicleFor(username: string): EntryDisplay["vehicle"] {
  const h = hash(username);
  return {
    body: BODIES[h % BODIES.length]!,
    turret: TURRETS[(h >> 3) % TURRETS.length]!,
    barrel: BARRELS[(h >> 6) % BARRELS.length]!,
    primary: FIELD_COLORS[(h >> 9) % FIELD_COLORS.length]!,
    accent: ACCENTS[(h >> 12) % ACCENTS.length]!,
    pattern: PATTERNS[(h >> 15) % PATTERNS.length]!,
    patternColor: PATTERN_COLORS[(h >> 21) % PATTERN_COLORS.length]!,
    decal: DECALS[(h >> 18) % DECALS.length]!,
  };
}

/** Synthetic roster used when the database returns fewer than MIN_ROSTER
 *  entries. Lets the leaderboard screen show what the experience looks
 *  like at scale even on a fresh install. Entries are marked with a
 *  negative userId so renderers can tell them apart if needed. */
const DEMO_CALLSIGNS = [
  "APEX", "IRONSIDE", "HAMMERDOWN", "REDLINE", "VIPER", "ORBIT",
  "GHOST-9", "COMBUST", "ANVIL", "BARRAGE", "FLAK", "SALVO",
  "MAVERICK", "TRACER", "LONGBOW", "SPARK", "HORIZON", "SWORD",
  "SENTINEL", "WILDFIRE", "OUTRIDER", "PATRIOT",
];

function paddedEntries(real: EntryDisplay[], target: number): EntryDisplay[] {
  if (real.length >= target) return real;
  const out = [...real];
  const usedNames = new Set(real.map((e) => e.username.toUpperCase()));
  let nextMmr = real.length > 0
    ? Math.max(800, real[real.length - 1]!.mmr - 30)
    : 2600;
  for (let i = 0; out.length < target; i++) {
    const name = DEMO_CALLSIGNS[i % DEMO_CALLSIGNS.length]! +
      (i >= DEMO_CALLSIGNS.length ? `-${Math.floor(i / DEMO_CALLSIGNS.length)}` : "");
    if (usedNames.has(name.toUpperCase())) continue;
    usedNames.add(name.toUpperCase());
    const rank = rankFor(nextMmr);
    const h = hash(name);
    out.push({
      rank: out.length + 1,
      username: name,
      mmr: nextMmr,
      wins: 30 + (h % 90),
      losses: 15 + ((h >> 5) % 60),
      kills: 80 + ((h >> 9) % 280),
      matches: 50 + ((h >> 13) % 140),
      vehicle: vehicleFor(name),
      rankName: rank.name,
      rankColor: rank.color,
      rankIcon: rank.icon,
      demo: true,
    } as EntryDisplay);
    nextMmr = Math.max(800, nextMmr - 25 - (h % 35));
  }
  // Renumber ranks so the list is contiguous 1..N regardless of mix.
  out.forEach((e, i) => { e.rank = i + 1; });
  return out;
}

export function LeaderboardPage({ navigate }: Props): JSX.Element {
  const [entries, setEntries] = useState<EntryDisplay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.leaderboard(50)
      .then((r) => {
        const decorated: EntryDisplay[] = r.entries.map((e) => {
          const r = rankFor(e.mmr);
          return {
            ...e,
            vehicle: vehicleFor(e.username),
            rankName: r.name,
            rankColor: r.color,
            rankIcon: r.icon,
          };
        });
        setEntries(paddedEntries(decorated, 18));
      })
      .catch((err) => setError(err?.message ?? "Failed to load"));
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h2>Top Brass</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: 12, margin: "0 0 14px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Only the most feared operators on the network.
        </p>
        {error && <div className="error">{error}</div>}
        {!entries ? (
          <p className="ops-muted">Receiving telemetry…</p>
        ) : entries.length === 0 ? (
          <p className="ops-muted">No ranked operators yet. Enlist to claim #1.</p>
        ) : (
          <>
            {entries.slice(0, 3).length > 0 && (
              <div className="podium">
                {[entries[1], entries[0], entries[2]].map((e, i) => {
                  if (!e) return <div key={i} className="podium-slot empty" />;
                  const place = e.rank;
                  return (
                    <div
                      key={e.rank}
                      className={`podium-slot place-${place} ${e.demo ? "demo" : ""}`}
                      onClick={() => {
                        click();
                        navigate({ name: "profile", username: e.username });
                      }}
                      title={e.demo ? "Demo operator — synthesized profile" : undefined}
                    >
                      <div className="podium-place">#{place}</div>
                      <TankPlate v={e.vehicle} big={place === 1} />
                      <div className="podium-name">{e.username}</div>
                      <div
                        className="podium-rank"
                        style={{ color: e.rankColor, borderColor: e.rankColor }}
                      >
                        <span
                          className="icon-mask rank-icon"
                          style={{
                            background: e.rankColor,
                            WebkitMaskImage: `url(${e.rankIcon})`,
                            maskImage: `url(${e.rankIcon})`,
                          }}
                        />
                        {e.rankName}
                      </div>
                      <div className="podium-mmr">{e.mmr}<span className="podium-mmr-lbl">MMR</span></div>
                      <div className="podium-stats">
                        <span>{e.wins}W</span>
                        <span>{e.losses}L</span>
                        <span>{e.kills}K</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="roster">
              {entries.slice(3).map((e) => (
                <div
                  key={e.rank}
                  className={`roster-row ${e.demo ? "demo" : ""}`}
                  onClick={() => {
                    click();
                    navigate({ name: "profile", username: e.username });
                  }}
                  title={e.demo ? "Demo operator — synthesized profile" : undefined}
                >
                  <span className="roster-rank">#{e.rank}</span>
                  <TankPlate v={e.vehicle} />
                  <div className="roster-id">
                    <span className="roster-name">{e.username}</span>
                    <span
                      className="roster-rankchip"
                      style={{ color: e.rankColor, borderColor: e.rankColor }}
                    >
                      <span
                        className="icon-mask rank-icon"
                        style={{
                          background: e.rankColor,
                          WebkitMaskImage: `url(${e.rankIcon})`,
                          maskImage: `url(${e.rankIcon})`,
                        }}
                      />
                      {e.rankName}
                    </span>
                  </div>
                  <span className="roster-mmr">{e.mmr}</span>
                  <span className="roster-num">{e.wins}W</span>
                  <span className="roster-num">{e.losses}L</span>
                  <span className="roster-num">{e.kills}K</span>
                  <span className="roster-num">{e.matches}M</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Small canvas preview of the operator's vehicle. Aspect mirrors the
 *  Customize preview so hulls read the same here as on that screen. */
function TankPlate({
  v, big = false,
}: { v: EntryDisplay["vehicle"]; big?: boolean }) {
  const w = big ? 180 : 112;
  const h = Math.round(w * 0.62);
  const ref = useRefCanvas(w, h, v);
  return (
    <canvas
      ref={ref}
      className={`tank-plate ${big ? "big" : ""}`}
      style={{ width: w, height: h }}
    />
  );
}

function useRefCanvas(w: number, h: number, v: EntryDisplay["vehicle"]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // High-DPI sharpness — size the canvas buffer at DPR, then scale the
    // drawing context so our logical draw coords match CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawMiniTank(ctx, w, h, v);
  }, [w, h, v.body, v.turret, v.barrel, v.primary, v.accent]);
  return ref;
}

function drawMiniTank(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: EntryDisplay["vehicle"],
) {
  renderLoadoutCanvas(ctx, {
    width: w,
    height: h,
    bodyStyle: v.body as BodyStyle,
    turretStyle: v.turret as TurretStyle,
    barrelStyle: v.barrel as BarrelStyle,
    primary: `#${v.primary.toString(16).padStart(6, "0")}`,
    accent:  `#${v.accent.toString(16).padStart(6, "0")}`,
    pattern: v.pattern as PatternStyle | undefined,
    patternColor: v.patternColor !== undefined
      ? `#${v.patternColor.toString(16).padStart(6, "0")}`
      : undefined,
    decal: v.decal as DecalStyle | undefined,
    showDeck: false,
  });
}
