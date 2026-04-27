import { useEffect } from "react";
import { Nav } from "./ui/Nav";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PlayPage } from "./pages/PlayPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { GamePage } from "./pages/GamePage";
import { SettingsPage, applySettingsOnBoot } from "./pages/SettingsPage";
import { CustomizePage } from "./pages/CustomizePage";
import { ArsenalPage } from "./pages/ArsenalPage";
import { AboutPage } from "./pages/AboutPage";
import { useAuth } from "./auth/AuthProvider";
import { useRouter } from "./router";
import { Sound } from "./game/audio/Sound";
import { MusicPlayer } from "./ui/MusicPlayer";

export function App(): JSX.Element {
  const { route, navigate } = useRouter();
  const { loading } = useAuth();

  useEffect(() => { applySettingsOnBoot(); }, []);

  // Always start on the menu pool here. GameShell flips to "battle" once
  // the match actually starts (phase === "playing") and back to "menu"
  // when the match ends or the player leaves, so lobby/countdown stays
  // calm and the epic battle tracks are reserved for in-game.
  useEffect(() => {
    Sound.init();
    Sound.installGesturePrimer();
    Sound.playMusic("menu");
  }, [route.name]);

  if (loading) {
    return (
      <div className="screen">
        <div className="center-card">
          <span className="center-card-stamp standby">Stand By</span>
          <h1>Loading</h1>
        </div>
      </div>
    );
  }

  if (route.name === "game") {
    // Key on the game route identity so going from one game route to
    // another (e.g. bots → private) hard-remounts GamePage, tearing down
    // the old Colyseus room + Phaser scene before rendering the next.
    // Without this, the old battle UI bleeds through until the new join
    // finishes because the component stays mounted and the effect
    // cleanup runs after the render.
    // Include `create` so `/game/new` navigates differently from a
    // specific `roomId` route; but once we replaceState to /game/room/...
    // the same mounted component continues running (key is stable).
    const gameKey = `${route.mode}:${route.roomId ?? (route.create ? "new" : "")}:${route.inviteCode ?? ""}:${route.botCount ?? ""}:${route.biome ?? ""}`;
    return (
      <>
        <GamePage key={gameKey} route={route} navigate={navigate} />
        <MusicPlayer />
      </>
    );
  }

  let page: JSX.Element;
  switch (route.name) {
    case "home": page = <HomePage navigate={navigate} />; break;
    case "login": page = <LoginPage navigate={navigate} />; break;
    case "register": page = <RegisterPage navigate={navigate} />; break;
    case "play": page = <PlayPage navigate={navigate} />; break;
    case "leaderboard": page = <LeaderboardPage navigate={navigate} />; break;
    case "settings": page = <SettingsPage navigate={navigate} />; break;
    case "customize": page = <CustomizePage navigate={navigate} />; break;
    case "arsenal": page = <ArsenalPage navigate={navigate} />; break;
    case "about": page = <AboutPage />; break;
    case "profile": page = <ProfilePage username={route.username} navigate={navigate} />; break;
  }

  return (
    <>
      <Nav navigate={navigate} route={route} />
      <div className="page" data-route={route.name}>{page}</div>
      <MusicPlayer />
    </>
  );
}
