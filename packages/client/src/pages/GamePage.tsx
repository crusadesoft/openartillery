import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { BattleState } from "@artillery/shared";
import type { Route } from "../router";
import { useAuth } from "../auth/AuthProvider";
import { joinBattle, waitForFirstState } from "../net/client";
import { GameShell } from "../ui/GameShell";

interface Props {
  route: Extract<Route, { name: "game" }>;
  navigate: (r: Route) => void;
}

type State =
  | { kind: "connecting" }
  | { kind: "game"; room: Room<BattleState> }
  | { kind: "error"; message: string };

export function GamePage({ route, navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [state, setState] = useState<State>({ kind: "connecting" });
  const roomRef = useRef<Room<BattleState> | null>(null);

  const connect = useCallback(
    async (signal: { aborted: boolean }) => {
      setState({ kind: "connecting" });
      const username =
        session?.user.username ??
        localStorage.getItem("artillery:guestName") ??
        `Guest${Math.floor(Math.random() * 1000)}`;
      try {
        const room = await joinBattle({
          mode: route.mode,
          username,
          inviteCode: route.inviteCode,
          botCount: route.botCount,
          botDifficulty: route.botDifficulty,
          biome: route.biome,
        });
        await waitForFirstState(room);
        if (signal.aborted) {
          // Component unmounted during the join — leave and bail.
          room.leave().catch(() => undefined);
          return;
        }
        roomRef.current = room;
        setState({ kind: "game", room });
      } catch (err) {
        if (signal.aborted) return;
        setState({ kind: "error", message: friendlyJoinError(err) });
      }
    },
    [
      route.mode,
      route.inviteCode,
      route.botCount,
      route.botDifficulty,
      route.biome,
      session,
    ],
  );

  useEffect(() => {
    const signal = { aborted: false };
    connect(signal);
    return () => {
      signal.aborted = true;
      const r = roomRef.current;
      roomRef.current = null;
      if (r) r.leave().catch(() => undefined);
    };
  }, [connect]);

  if (state.kind === "connecting") {
    return (
      <div className="screen">
        <div className="center-card">
          <h1>Connecting…</h1>
          <p className="tagline">
            Mode: <strong>{route.mode}</strong>
            {route.inviteCode ? ` · code ${route.inviteCode}` : ""}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="screen">
        <div className="center-card">
          <h1>Couldn't join</h1>
          <div className="error">{state.message}</div>
          <button
            className="primary-btn"
            onClick={() => connect({ aborted: false })}
          >
            Retry
          </button>
          <button
            className="secondary-btn"
            onClick={() => navigate({ name: "play" })}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const leave = () => {
    roomRef.current = null;
    state.room.leave().catch(() => undefined);
    navigate({ name: "play" });
  };

  return <GameShell room={state.room} onLeave={leave} />;
}

// Colyseus surfaces transport failures as a raw `ProgressEvent` whose
// String() form is `[object ProgressEvent]`. Dig out a useful message
// instead — check `.message` (our own throws + most Error subclasses),
// then a few common Colyseus error shapes, else a generic connection
// message. Never show the raw object to the user.
function friendlyJoinError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const obj = err as { message?: string; code?: number | string; reason?: string; type?: string } | null;
  if (obj?.message) return obj.message;
  if (obj?.reason) return obj.reason;
  if (obj?.code) return `Couldn't reach the server (code ${obj.code}).`;
  if (obj?.type === "error") return "Couldn't reach the server.";
  return "Couldn't reach the server.";
}
