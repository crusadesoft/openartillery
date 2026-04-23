/**
 * Animated CSS/SVG backdrop for all menu screens. Purely presentational —
 * it never affects layout or accepts props.
 */
export function Backdrop(): JSX.Element {
  return (
    <div className="backdrop" aria-hidden>
      <div className="tracers">
        <span className="arc" />
        <span className="arc" />
        <span className="arc" />
      </div>
    </div>
  );
}
