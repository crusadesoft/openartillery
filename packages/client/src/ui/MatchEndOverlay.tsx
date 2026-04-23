import { useMemo } from "react";
import type { Room } from "colyseus.js";
import type { BattleState, Player } from "@artillery/shared";
import { SfxButton } from "./SfxButton";

interface Props {
  room: Room<BattleState>;
  onLeave: () => void;
}

export function MatchEndOverlay({ room, onLeave }: Props): JSX.Element {
  const winner = room.state.winnerId
    ? room.state.players.get(room.state.winnerId)
    : null;

  const sorted = useMemo<Player[]>(() => {
    const all = Array.from(room.state.players.values());
    return all.sort((a, b) => {
      if (a.dead !== b.dead) return a.dead ? 1 : -1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.damageDealt - a.damageDealt;
    });
  }, [room.state.players]);

  const rematch = () => room.send("rematch", {});

  return (
    <div className="match-end">
      <div className="panel">
        <h1>{winner ? `${winner.name} wins` : "Stalemate"}</h1>
        <p className="winner-line">
          {winner
            ? `${winner.kills} kill${winner.kills === 1 ? "" : "s"} · ${Math.round(winner.damageDealt)} dmg dealt`
            : "No last tank standing."}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Kills</th>
              <th>Damage</th>
              <th>Shots</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.id}
                className={winner && p.id === winner.id ? "winner" : ""}
              >
                <td>{i + 1}</td>
                <td>
                  {p.name}
                  {p.bot ? (
                    <span style={{ color: "var(--ink-faint)" }}> · bot</span>
                  ) : (
                    ""
                  )}
                </td>
                <td>{p.kills}</td>
                <td>{Math.round(p.damageDealt)}</td>
                <td>{p.shotsFired}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 20 }}>
          <SfxButton className="go-btn" onClick={rematch}>
            Rematch
          </SfxButton>
          <SfxButton className="danger-btn" onClick={onLeave}>
            Leave
          </SfxButton>
        </div>
      </div>
    </div>
  );
}
