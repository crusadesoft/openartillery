import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { SfxButton } from "./SfxButton";

interface Props {
  navigate: (r: Route) => void;
  route: Route;
}

export function Nav({ navigate, route }: Props): JSX.Element {
  const { session, logout } = useAuth();
  const go = (r: Route) => () => navigate(r);
  const tabClass = (name: Route["name"]) =>
    `ribbon-tab${route.name === name ? " active" : ""}`;
  return (
    <div className="nav ribbon-strip">
      <span className="brand" onClick={go({ name: "home" })}>
        OPENARTILLERY
      </span>
      <SfxButton className={tabClass("play")} onClick={go({ name: "play" })}>Play</SfxButton>
      <SfxButton className={tabClass("customize")} onClick={go({ name: "customize" })}>Customize</SfxButton>
      <SfxButton className={tabClass("arsenal")} onClick={go({ name: "arsenal" })}>Arsenal</SfxButton>
      <SfxButton className={tabClass("leaderboard")} onClick={go({ name: "leaderboard" })}>Leaderboard</SfxButton>
      {session && (
        <SfxButton
          className={tabClass("profile")}
          onClick={go({ name: "profile", username: session.user.username })}
        >
          Profile
        </SfxButton>
      )}
      <SfxButton className={tabClass("settings")} onClick={go({ name: "settings" })}>Settings</SfxButton>
      <SfxButton className={tabClass("about")} onClick={go({ name: "about" })}>About</SfxButton>
      <div className="spacer" />
      {session ? (
        <>
          <span className="user">
            <strong>{session.user.username}</strong>
            <span className="mmr-chip">{session.user.mmr}</span>
          </span>
          <SfxButton className="ribbon-tab" onClick={() => void logout()}>Sign out</SfxButton>
        </>
      ) : (
        <>
          <SfxButton className={tabClass("login")} onClick={go({ name: "login" })}>Sign in</SfxButton>
          <SfxButton className={tabClass("register")} onClick={go({ name: "register" })}>Register</SfxButton>
        </>
      )}
    </div>
  );
}
