import { useMemo } from "react";
import type { Room } from "colyseus.js";
import type { BattleState, Player } from "@artillery/shared";
import { teamLabel, teamTint } from "./lobby/teamMeta";

interface Props {
  room: Room<BattleState>;
  /** Seconds remaining until the room either resets to the lobby
   *  (casual) or kicks the client back to /play (ranked). */
  secondsLeft: number;
  ranked: boolean;
}

export function MatchEndOverlay({ room, secondsLeft, ranked }: Props): JSX.Element {
  const teamMode = room.state.teamMode;
  const teamCount = Math.max(2, room.state.teamCount || 2);
  const winnerTeam = room.state.winnerTeam;
  const winnerTeamNum = Number(winnerTeam) || 0;
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

  const tail = ranked
    ? `Returning to menu in ${secondsLeft}s…`
    : `Next round in ${secondsLeft}s…`;

  if (teamMode) {
    const headline = winnerTeamNum > 0 ? `${teamLabel(winnerTeamNum)} wins` : "Stalemate";
    const teams: { team: number; roster: Player[] }[] = [];
    for (let t = 1; t <= teamCount; t++) {
      teams.push({ team: t, roster: sorted.filter((p) => p.team === t) });
    }
    return (
      <div className="match-end">
        <div className="after-action" data-tab="After-Action">
          <span className="paper-paperclip" aria-hidden="true" />
          <div className="report-page">
            <span className={`report-stamp ${winnerTeamNum > 0 ? "" : "draw"}`}>
              {winnerTeamNum > 0 ? "Final" : "Inconclusive"}
            </span>
            <h1>{headline}</h1>
            <p className="winner-line">
              {winnerTeamNum > 0
                ? "Last team standing."
                : "Every team wiped on the same shot."}
            </p>
            {teams.map(({ team, roster }) => (
              <TeamTable
                key={team}
                label={teamLabel(team)}
                tint={teamTint(team)}
                players={roster}
                winning={winnerTeamNum === team}
              />
            ))}
            <p className="report-foot">{tail}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="match-end">
      <div className="after-action" data-tab="After-Action">
        <span className="paper-paperclip" aria-hidden="true" />
        <div className="report-page">
          <span className={`report-stamp ${winner ? "" : "draw"}`}>
            {winner ? "Final" : "Inconclusive"}
          </span>
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
                    {p.bot ? <span className="report-bot"> · bot</span> : ""}
                  </td>
                  <td>{p.kills}</td>
                  <td>{Math.round(p.damageDealt)}</td>
                  <td>{p.shotsFired}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-foot">{tail}</p>
        </div>
      </div>
    </div>
  );
}

interface TeamTableProps {
  label: string;
  tint: string;
  players: Player[];
  winning: boolean;
}

function TeamTable({ label, tint, players, winning }: TeamTableProps): JSX.Element {
  const totalKills = players.reduce((n, p) => n + p.kills, 0);
  const totalDmg = players.reduce((n, p) => n + p.damageDealt, 0);
  return (
    <div className="report-team">
      <div
        className={`report-team-head ${winning ? "winning" : ""}`}
        style={{ borderBottomColor: tint }}
      >
        <span style={{ color: tint }}>{label}</span>
        <span className="report-team-count"> · {players.length}</span>
        {winning && <span className="report-team-flag"> · Winners</span>}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Kills</th>
            <th>Damage</th>
            <th>Shots</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className={winning ? "winner" : ""}>
              <td>
                {p.name}
                {p.bot ? <span className="report-bot"> · bot</span> : ""}
              </td>
              <td>{p.kills}</td>
              <td>{Math.round(p.damageDealt)}</td>
              <td>{p.shotsFired}</td>
            </tr>
          ))}
          <tr className="report-team-total">
            <td><strong>Team total</strong></td>
            <td>{totalKills}</td>
            <td>{Math.round(totalDmg)}</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
