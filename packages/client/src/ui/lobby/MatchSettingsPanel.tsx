import { Slider } from "./Slider";
import type { MatchSettings } from "./types";

interface Props {
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  windMax: number;
  onSettings: (patch: Partial<MatchSettings>) => void;
}

export function MatchSettingsPanel({
  turnDurationSec,
  fuelPerTurn,
  startingHp,
  windMax,
  onSettings,
}: Props): JSX.Element {
  return (
    <>
      <div className="lobby-stage-section-title">Match settings</div>
      <Slider
        label="Turn Time" unit="s"
        min={10} max={90} step={5}
        value={turnDurationSec}
        onChange={(v) => onSettings({ turnDurationSec: v })}
      />
      <Slider
        label="Fuel"
        min={0} max={200} step={10}
        value={fuelPerTurn}
        onChange={(v) => onSettings({ fuelPerTurn: v })}
      />
      <Slider
        label="Starting HP"
        min={100} max={600} step={25}
        value={startingHp}
        onChange={(v) => onSettings({ startingHp: v })}
      />
      <Slider
        label="Max Wind"
        min={0} max={60} step={5}
        value={windMax}
        onChange={(v) => onSettings({ maxWind: v })}
      />
    </>
  );
}
