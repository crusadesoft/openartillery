import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type {
  BattleState,
  MatchPhase,
  ServerEvent,
  WeaponId,
} from "@artillery/shared";
import { MODES, type GameMode } from "@artillery/shared";
import { PhaserGame } from "../game/PhaserGame";
import { ChatPanel } from "./ChatPanel";
import { HudOverlay } from "./HudOverlay";
import { Lobby } from "./Lobby";
import { MobileControls } from "./MobileControls";
import { KillFeed } from "./KillFeed";
import { Minimap } from "./Minimap";
import { MatchEndOverlay } from "./MatchEndOverlay";
import { TurnChip } from "./TurnChip";
import { WeaponTray } from "./WeaponTray";
import { FireButton } from "./FireButton";
import { PauseMenu } from "./PauseMenu";

interface Props { room: Room<BattleState>; onLeave: () => void; }

interface ChatEntry { id: number; name: string; text: string; system?: boolean; }

export function GameShell({ room, onLeave }: Props): JSX.Element {
  const [phase, setPhase] = useState<MatchPhase>(room.state.phase);
  const [tick, setTick] = useState(0);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [lastKill, setLastKill] = useState<
    Extract<ServerEvent, { type: "kill" }> | null
  >(null);

  const phaserHostRef = useRef<HTMLDivElement>(null);
  const phaserRef = useRef<PhaserGame | null>(null);
  const chatIdRef = useRef(0);

  useEffect(() => {
    if (!phaserHostRef.current || phaserRef.current) return;
    phaserRef.current = new PhaserGame(phaserHostRef.current, room);
    return () => {
      phaserRef.current?.destroy();
      phaserRef.current = null;
    };
  }, [room]);

  // Ref-guarded so React StrictMode's double-mount doesn't double-register
  // the event listener (which was causing chat messages to appear twice).
  const wiredRef = useRef<Room<BattleState> | null>(null);
  useEffect(() => {
    if (wiredRef.current === room) return;
    wiredRef.current = room;

    const rerender = () => {
      setPhase(room.state.phase);
      setTick((t) => (t + 1) % 1_000_000);
    };
    room.onStateChange(rerender);
    room.onLeave(() => setTimeout(() => onLeave(), 400));
    room.onError(() => undefined);

    room.onMessage("event", (evt: ServerEvent) => {
      if (evt.type === "chat") {
        pushChat({
          id: ++chatIdRef.current,
          name: evt.name,
          text: evt.text,
          system: evt.name === "server",
        });
      } else if (evt.type === "kill") {
        setLastKill(evt);
      }
      phaserRef.current?.game.events.emit("server-event", evt);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Drive a 5Hz local tick for the lobby countdown + turn timer. The server
  // only patches state when something actually changes, which would otherwise
  // leave the "Starting in 5…3…" text frozen.
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const self = room.state.players.get(room.sessionId);
  const currentTurn = room.state.currentTurnId;
  const isMyTurn = currentTurn === room.sessionId;
  const currentPlayer = room.state.players.get(currentTurn);

  const players = useMemo(() => {
    void tick;
    return Array.from(room.state.players.values());
  }, [tick, room.state.players]);

  function pushChat(entry: ChatEntry) {
    setChat((prev) => [...prev.slice(-60), entry]);
  }

  const sendChat = (text: string) => room.send("chat", { text });
  const toggleReady = () => {
    if (!self) return;
    room.send("ready", { ready: !self.ready });
  };
  const addBot = (difficulty: string) => room.send("addBot", { difficulty });

  const mode = (room.state.mode || "ffa") as GameMode;
  const minPlayers = MODES[mode]?.minPlayers ?? 2;

  const hasFlight = room.state.projectiles.size > 0;
  const selfPower = self?.power ?? 0;

  return (
    <div className="game-wrapper">
      <div id="phaser-host" ref={phaserHostRef} />

      {(phase === "waiting" || phase === "countdown") && (
        <Lobby
          players={players}
          selfId={room.sessionId}
          phase={phase}
          mode={MODES[mode]?.label ?? mode}
          rawMode={mode}
          biome={room.state.biome}
          minPlayers={minPlayers}
          inviteCode={room.state.inviteCode}
          startsInMs={Math.max(0, room.state.roundStartsAt - Date.now())}
          turnDurationSec={room.state.turnDurationSec || 30}
          fuelPerTurn={room.state.fuelPerTurn || 100}
          startingHp={room.state.startingHp || 100}
          windMax={room.state.windMax || 25}
          onReadyToggle={toggleReady}
          onAddBot={addBot}
          onRemoveBot={(sessionId) => room.send("removeBot", { sessionId })}
          onSetBotDifficulty={(sessionId, difficulty) =>
            room.send("setBotDifficulty", { sessionId, difficulty })
          }
          onSettings={(patch) => room.send("setMatchSettings", patch)}
          onLeave={onLeave}
        />
      )}

      {phase === "playing" && (
        <>
          <TurnChip
            current={currentPlayer}
            isMyTurn={isMyTurn}
            turnEndsAt={room.state.turnEndsAt}
            wind={room.state.wind}
            tick={tick}
          />
          <KillFeed event={lastKill} />
          <Minimap room={room} tick={tick} />
          <HudOverlay
            players={players}
            self={self}
            currentTurnId={currentTurn}
            tick={tick}
          />
          <WeaponTray
            room={room}
            self={self}
            currentWeapon={(self?.weapon ?? "shell") as WeaponId}
            isMyTurn={isMyTurn}
            locked={!isMyTurn || hasFlight || !!self?.dead}
          />
          <FireButton
            room={room}
            power={selfPower}
            isMyTurn={isMyTurn}
            hasFlight={hasFlight}
          />
          <MobileControls room={room} />
        </>
      )}

      {phase === "ended" && (
        <MatchEndOverlay room={room} onLeave={onLeave} />
      )}

      <ChatPanel entries={chat} onSend={sendChat} />
      <PauseMenu onLeave={onLeave} />
    </div>
  );
}
