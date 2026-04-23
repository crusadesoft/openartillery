import { FormEvent, useState } from "react";

interface Props {
  onPlay: (name: string) => void;
  error?: string;
}

export function MainMenu({ onPlay, error }: Props): JSX.Element {
  const [name, setName] = useState<string>(() => {
    return localStorage.getItem("artillery:name") ?? randomName();
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 16) || randomName();
    localStorage.setItem("artillery:name", trimmed);
    onPlay(trimmed);
  };

  return (
    <div className="screen">
      <form className="menu-card" onSubmit={submit}>
        <h1>ARTILLERY</h1>
        <p className="tagline">
          Turn-based tank carnage. Wind, gravity, destructible earth.
        </p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="name">Callsign</label>
          <input
            id="name"
            autoFocus
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your handle"
          />
        </div>
        <button type="submit" className="primary-btn">
          Play
        </button>
        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          Controls: A/D drive · W/S aim · Q/E weapon · Space charge/fire
        </p>
      </form>
    </div>
  );
}

function randomName(): string {
  const adj = ["Iron", "Rusty", "Silent", "Rapid", "Stormy", "Dusty", "Shadow", "Blaze"];
  const noun = ["Hydra", "Boar", "Vulture", "Bishop", "Raven", "Wolf", "Gnat", "Falcon"];
  const a = adj[Math.floor(Math.random() * adj.length)]!;
  const b = noun[Math.floor(Math.random() * noun.length)]!;
  return `${a}${b}`;
}
