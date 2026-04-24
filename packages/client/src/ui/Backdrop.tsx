import { useMemo } from "react";

/**
 * Animated CSS/SVG backdrop for all menu screens. Renders a layered
 * structure (sky + scene + particles + streaks + grain) that per-theme CSS
 * re-paints into a distinct scene — rust foundry, desert, arctic, dusk,
 * jungle. Particles get deterministic positions/delays from a golden-ratio
 * spread so every client sees the same field without runtime randomness.
 */
const PARTICLE_COUNT = 28;

export function Backdrop(): JSX.Element {
  const particles = useMemo(() => {
    const G = 0.6180339887;
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const a = (i * G) % 1;
      const b = ((i * G * 2) + 0.37) % 1;
      const c = ((i * G * 3) + 0.11) % 1;
      return {
        x: a * 100,
        y: b * 100,
        delay: -c * 18,
        dur: 9 + b * 16,
        scale: 0.55 + a * 1.3,
      };
    });
  }, []);

  return (
    <div className="backdrop" aria-hidden>
      <div className="bd-sky" />
      <div className="bd-scene" />
      <div className="bd-aux" />
      <div className="bd-fx">
        {particles.map((p, i) => (
          <span
            key={i}
            className="bd-particle"
            style={
              {
                "--px": `${p.x}%`,
                "--py": `${p.y}%`,
                "--pdelay": `${p.delay}s`,
                "--pdur": `${p.dur}s`,
                "--pscale": p.scale,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="bd-streaks">
        <span className="bd-streak" />
        <span className="bd-streak" />
        <span className="bd-streak" />
      </div>
      <div className="bd-grain" />
    </div>
  );
}
