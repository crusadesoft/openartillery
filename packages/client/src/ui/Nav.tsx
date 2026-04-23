import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { SfxButton } from "./SfxButton";

interface Props { navigate: (r: Route) => void; }

export function Nav({ navigate }: Props): JSX.Element {
  const { session, logout } = useAuth();
  const go = (r: Route) => () => navigate(r);
  return (
    <div className="nav">
      <span className="brand" onClick={go({ name: "home" })}>
        ARTILLERY
      </span>
      <SfxButton onClick={go({ name: "play" })}>Play</SfxButton>
      <SfxButton onClick={go({ name: "customize" })}>Customize</SfxButton>
      <SfxButton onClick={go({ name: "arsenal" })}>Arsenal</SfxButton>
      <SfxButton onClick={go({ name: "leaderboard" })}>Leaderboard</SfxButton>
      {session && (
        <SfxButton
          onClick={go({ name: "profile", username: session.user.username })}
        >
          Profile
        </SfxButton>
      )}
      <SfxButton onClick={go({ name: "settings" })}>Settings</SfxButton>
      <div className="spacer" />
      {session ? (
        <>
          <span className="user">
            <strong>{session.user.username}</strong>
            <span className="mmr-chip">{session.user.mmr}</span>
          </span>
          <SfxButton onClick={() => void logout()}>Sign out</SfxButton>
        </>
      ) : (
        <>
          <SfxButton onClick={go({ name: "login" })}>Sign in</SfxButton>
          <SfxButton onClick={go({ name: "register" })}>Register</SfxButton>
        </>
      )}
    </div>
  );
}
