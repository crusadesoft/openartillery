import { useEffect } from "react";
import { Nav } from "./ui/Nav";
import { Backdrop } from "./ui/Backdrop";
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
import { useAuth } from "./auth/AuthProvider";
import { useRouter } from "./router";
import { Sound } from "./game/audio/Sound";
import { MusicPlayer } from "./ui/MusicPlayer";

export function App(): JSX.Element {
  const { route, navigate } = useRouter();
  const { loading } = useAuth();

  useEffect(() => { applySettingsOnBoot(); }, []);

  // Swap between menu + battle tracks based on route. SFX + music init is
  // lazy (browsers require a user gesture), so the first play in the session
  // might be silent until the player clicks anything.
  useEffect(() => {
    Sound.init();
    Sound.installGesturePrimer();
    if (route.name === "game") Sound.playMusic("battle");
    else Sound.playMusic("menu");
  }, [route.name]);

  if (loading) {
    return (
      <>
        <Backdrop />
        <div className="screen">
          <div className="center-card">
            <h1>Loading…</h1>
          </div>
        </div>
      </>
    );
  }

  if (route.name === "game") {
    // Key on the game route identity so going from one game route to
    // another (e.g. bots → private) hard-remounts GamePage, tearing down
    // the old Colyseus room + Phaser scene before rendering the next.
    // Without this, the old battle UI bleeds through until the new join
    // finishes because the component stays mounted and the effect
    // cleanup runs after the render.
    const gameKey = `${route.mode}:${route.inviteCode ?? ""}:${route.botCount ?? ""}:${route.biome ?? ""}`;
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
    case "profile": page = <ProfilePage username={route.username} navigate={navigate} />; break;
  }

  return (
    <>
      <Backdrop />
      <Nav navigate={navigate} />
      <div className="page">{page}</div>
      <MusicPlayer />
    </>
  );
}
