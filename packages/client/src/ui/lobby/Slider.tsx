export function Slider({
  label, unit, min, max, step, value, onChange,
}: {
  label: string; unit?: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="match-setting-row">
      <div className="match-setting-head">
        <span>{label}</span>
        <span className="match-setting-value">{value}{unit ?? ""}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
