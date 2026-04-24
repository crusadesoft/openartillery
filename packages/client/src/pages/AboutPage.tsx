import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export function AboutPage({ navigate }: Props): JSX.Element {
  return (
    <div className="container">
      <div className="card">
        <h2>About OpenArtillery</h2>
        <p style={{ color: "var(--ink)", fontSize: 14, lineHeight: 1.6 }}>
          OpenArtillery is a free multiplayer artillery game that runs in
          any modern browser. Players take turns aiming and firing tanks
          across procedurally generated maps with fully destructible terrain,
          wind, and gravity. Modes include free-for-all, duel, private
          invite lobbies, and practice matches against AI bots of varying
          difficulty. Ranked play updates MMR and a public leaderboard.
          Plays on desktop and mobile. No install, no account required
          to play against bots.
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
