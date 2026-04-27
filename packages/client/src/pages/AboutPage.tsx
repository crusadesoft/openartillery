export function AboutPage(): JSX.Element {
  return (
    <div className="container about-page">
      <div className="scene-manual">
        <div className="manual-header">
          <span className="manual-stamp">Field Manual · FM-2026</span>
          <span className="manual-page-label">Section I</span>
        </div>

        <h1 className="manual-h1">About OpenArtillery</h1>
        <p className="manual-lede">
          A field guide for incoming operators.
        </p>

        <div className="manual-cols">
          <p>
            OpenArtillery is a free multiplayer artillery game that runs in
            any modern browser. Players take turns aiming and firing tanks
            across procedurally generated maps with fully destructible
            terrain, wind, and gravity.
          </p>
          <p>
            Modes include free-for-all, duel, private invite lobbies, and
            practice matches against AI bots of varying difficulty. Ranked
            play updates MMR and a public leaderboard. Plays on desktop and
            mobile. No install, no account required to play against bots.
          </p>
        </div>

        <h2 className="manual-h2">§ Contact</h2>
        <div className="manual-cols single">
          <p>
            Bug reports, feature ideas, or just saying hi:
            {" "}
            <a href="mailto:info@openartillery.net">info@openartillery.net</a>
          </p>
          <p>
            Prefer GitHub? File an issue on the{" "}
            <a href="https://github.com/crusadesoft/artillery/issues" target="_blank" rel="noreferrer">
              repository
            </a>
            .
          </p>
        </div>

        <h2 className="manual-h2">§ Credits</h2>
        <div className="manual-cols">
          <p>
            Music by{" "}
            <a href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">
              Scott Buckley
            </a>
            {" "}— CC-BY 4.0.
          </p>
          <p>
            Weapon + medal icons from{" "}
            <a href="https://game-icons.net" target="_blank" rel="noreferrer">
              game-icons.net
            </a>
            {" "}(lorc / Delapouite) — CC-BY 3.0.
          </p>
          <p>
            Explosion SFX by Viktor Hahn (opengameart.org) — CC-BY-SA 3.0.
            Cannon fire by Thimras — CC0. UI sounds by p0ss — CC-BY-SA 3.0.
          </p>
          <p>
            Textures from{" "}
            <a href="https://ambientcg.com" target="_blank" rel="noreferrer">
              ambientCG
            </a>
            {" "}— CC0.
          </p>
        </div>

        <span className="manual-page-num">PG. 001</span>
      </div>
    </div>
  );
}
