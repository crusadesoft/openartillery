import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export function AboutPage({ navigate }: Props): JSX.Element {
  return (
    <div className="container">
      <div className="card">
        <h2>About OpenArtillery</h2>
        <p style={{ color: "var(--ink)", fontSize: 14, lineHeight: 1.6 }}>
          OpenArtillery is a browser-based multiplayer artillery game — turn-based
          tank combat with destructible terrain, wind, gravity, a growing arsenal
          of weapons, and bots to practice against. It runs entirely in the
          browser; no install.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, marginTop: 12 }}>
          Built as an open-source take on the Scorched Earth / Worms formula.
          The match server is authoritative (no cheating), the physics are
          hand-rolled (because destructible heightmaps don't fit general
          engines), and the whole thing is a love letter to the era of
          friends-passing-the-keyboard artillery games.
        </p>
      </div>

      <div className="card">
        <h2>Contact</h2>
        <p style={{ color: "var(--ink)", fontSize: 14, margin: "0 0 10px" }}>
          Bug reports, feature ideas, or just saying hi:
          {" "}
          <a href="mailto:info@openartillery.net">info@openartillery.net</a>
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: 0 }}>
          Prefer GitHub? File an issue on the{" "}
          <a href="https://github.com/crusadesoft/artillery/issues" target="_blank" rel="noreferrer">
            repository
          </a>
          .
        </p>
      </div>

      <div className="card">
        <h2>Tech</h2>
        <ul style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>Client — React + TypeScript, Phaser 3 for the battle canvas</li>
          <li>Server — Node + Colyseus for authoritative match state</li>
          <li>Storage — Postgres (accounts, matches) via Drizzle, Redis for presence</li>
          <li>Edge — Cloudflare Tunnel in front of a single VPS</li>
        </ul>
      </div>

      <div className="card">
        <h2>Credits</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>
          Music by{" "}
          <a href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">
            Scott Buckley
          </a>
          {" "}— CC-BY 4.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>
          Weapon + medal icons from{" "}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer">
            game-icons.net
          </a>
          {" "}(lorc / Delapouite) — CC-BY 3.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>
          Explosion SFX by Viktor Hahn (opengameart.org) — CC-BY-SA 3.0.
          Cannon fire by Thimras — CC0. UI sounds by p0ss — CC-BY-SA 3.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Textures from{" "}
          <a href="https://ambientcg.com" target="_blank" rel="noreferrer">
            ambientCG
          </a>
          {" "}— CC0.
        </p>
      </div>

      <div className="card">
        <SfxButton className="ghost-btn" onClick={() => navigate({ name: "home" })}>
          ← Back
        </SfxButton>
      </div>
    </div>
  );
}
