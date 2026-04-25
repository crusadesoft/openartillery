import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type {
  BattleState,
  MatchPhase,
  ServerEvent,
  WeaponId,
} from "@artillery/shared";
import { MODES, POST_MATCH_RECAP_MS, type GameMode } from "@artillery/shared";
import { PhaserGame } from "../game/PhaserGame";
import { Sound } from "../game/audio/Sound";
import { ChatPanel } from "./ChatPanel";
import { HudOverlay } from "./HudOverlay";
import { Lobby } from "./Lobby";
import { MobileControls } from "./MobileControls";
import { KillFeed } from "./KillFeed";
import { Minimap } from "./Minimap";
import { MatchEndOverlay } from "./MatchEndOverlay";
import { TurnChip } from "./TurnChip";
import { WeaponTray } from "./WeaponTray";
import { ItemTray } from "./ItemTray";
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

  const phaserActive = phase === "playing" || phase === "ended";
  useEffect(() => {
    if (!phaserActive) return;
    if (!phaserHostRef.current || phaserRef.current) return;
    phaserRef.current = new PhaserGame(phaserHostRef.current, room);
    return () => {
      phaserRef.current?.destroy();
      phaserRef.current = null;
    };
  }, [room, phaserActive]);

  // Reserve a strip at the bottom for in-battle UI so weapon tray / fire
  // button / minimap / chat don't sit over the rendered terrain. CSS
  // shrinks #phaser-host upward and any window resize makes Phaser
  // recompute its viewport.
  useEffect(() => {
    if (phase !== "playing") return;
    document.documentElement.classList.add("battle-active");
    window.dispatchEvent(new Event("resize"));
    return () => {
      document.documentElement.classList.remove("battle-active");
      window.dispatchEvent(new Event("resize"));
    };
  }, [phase]);

  // Swap to the battle music pool only when the match is actually under
  // way; lobby (waiting/countdown) and the post-match recap stay on the
  // calm menu loop. The unmount cleanup covers the player-leaves path.
  useEffect(() => {
    if (phase === "playing") Sound.playMusic("battle");
    else Sound.playMusic("menu");
  }, [phase]);
  useEffect(() => {
    return () => { Sound.playMusic("menu"); };
  }, []);

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

  const inLobby = phase === "waiting" || phase === "countdown";

  // Recap window: server resets casual rooms to "waiting" on its own;
  // ranked clients have no in-room lobby to return to, so we leave to
  // /play once the recap timer elapses. Anchored to matchEndedAt so a
  // mid-match reload still lands at the right instant.
  const ranked = room.state.ranked;
  const matchEndedAt = room.state.matchEndedAt;
  const recapEndsAt = matchEndedAt > 0 ? matchEndedAt + POST_MATCH_RECAP_MS : 0;
  const recapMsLeft = recapEndsAt > 0 ? Math.max(0, recapEndsAt - Date.now()) : POST_MATCH_RECAP_MS;
  const recapSecondsLeft = Math.ceil(recapMsLeft / 1000);

  const leftRef = useRef(false);
  useEffect(() => {
    if (phase !== "ended" || !ranked) return;
    if (recapEndsAt === 0) return;
    const delay = Math.max(0, recapEndsAt - Date.now());
    const id = window.setTimeout(() => {
      if (leftRef.current) return;
      leftRef.current = true;
      onLeave();
    }, delay);
    return () => window.clearTimeout(id);
  }, [phase, ranked, recapEndsAt, onLeave]);

  return (
    <div className="game-wrapper">
      {phaserActive && <div id="phaser-host" ref={phaserHostRef} />}

      {inLobby && (
        <Lobby
          players={players}
          selfId={room.sessionId}
          hostId={room.state.hostSessionId}
          phase={phase}
          mode={MODES[mode]?.label ?? mode}
          rawMode={mode}
          biome={room.state.biome}
          biomeRandom={room.state.biomeRandom}
          minPlayers={minPlayers}
          maxPlayers={room.state.maxPlayers || MODES[mode]?.maxPlayers || 6}
          lobbyName={room.state.lobbyName}
          visibility={room.state.visibility || "public"}
          hasPassword={room.state.hasPassword}
          inviteCode={room.state.inviteCode}
          startsInMs={Math.max(0, room.state.roundStartsAt - Date.now())}
          turnDurationSec={room.state.turnDurationSec || 30}
          fuelPerTurn={room.state.fuelPerTurn || 100}
          startingHp={room.state.startingHp || 300}
          windMax={room.state.windMax || 25}
          teamMode={room.state.teamMode}
          teamCount={room.state.teamCount}
          friendlyFire={room.state.friendlyFire}
          ranked={room.state.ranked}
          hasBots={players.some((p) => p.bot)}
          onReadyToggle={toggleReady}
          onAddBot={addBot}
          onRemoveBot={(sessionId) => room.send("removeBot", { sessionId })}
          onSetBotDifficulty={(sessionId, difficulty) =>
            room.send("setBotDifficulty", { sessionId, difficulty })
          }
          onSettings={(patch) => room.send("setMatchSettings", patch)}
          onLobbyConfig={(patch) => room.send("setLobbyConfig", patch)}
          onSetTeam={(sessionId, team) => room.send("setTeam", { sessionId, team })}
          onShuffleTeams={() => room.send("shuffleTeams")}
          chatEntries={chat}
          onChat={sendChat}
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
          <HudOverlay
            players={players}
            self={self}
            currentTurnId={currentTurn}
            tick={tick}
            teamMode={room.state.teamMode}
            teamCount={room.state.teamCount}
          />
          <MobileControls room={room} />
          <div className="battle-bottom-bar">
            <div className="bar-section bar-left">
              <ChatPanel entries={chat} onSend={sendChat} />
            </div>
            <div className="bar-section bar-minimap">
              <Minimap room={room} tick={tick} />
            </div>
            <div className="bar-section bar-trays">
              <ItemTray
                room={room}
                self={self}
                isMyTurn={isMyTurn}
                locked={!isMyTurn || hasFlight || !!self?.dead}
              />
              <WeaponTray
                room={room}
                self={self}
                currentWeapon={(self?.weapon ?? "shell") as WeaponId}
                isMyTurn={isMyTurn}
                locked={!isMyTurn || hasFlight || !!self?.dead}
              />
            </div>
            <div className="bar-section bar-fire">
              <FireButton
                room={room}
                power={selfPower}
                isMyTurn={isMyTurn}
                hasFlight={hasFlight}
              />
            </div>
          </div>
        </>
      )}

      {phase === "ended" && (
        <MatchEndOverlay room={room} secondsLeft={recapSecondsLeft} ranked={ranked} />
      )}

      {phase === "ended" && <ChatPanel entries={chat} onSend={sendChat} />}
      <PauseMenu onLeave={onLeave} />
    </div>
  );
}
