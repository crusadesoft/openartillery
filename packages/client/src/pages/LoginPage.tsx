import { FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { ApiError } from "../auth/authClient";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export function LoginPage({ navigate }: Props): JSX.Element {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate({ name: "home" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageForError(err));
      } else {
        setError("Login failed. Try again.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container">
      <form className="card" style={{ maxWidth: 420, margin: "40px auto" }} onSubmit={submit}>
        <h2>Sign in</h2>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <SfxButton className="primary-btn" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </SfxButton>
        <SfxButton
          type="button"
          className="ghost-btn"
          onClick={() => navigate({ name: "register" })}
        >
          Need an account? Register
        </SfxButton>
      </form>
    </div>
  );
}

function messageForError(err: ApiError): string {
  if (err.code === "invalid_credentials") return "Wrong username or password.";
  if (err.code === "rate_limited") return "Too many attempts. Try again in a minute.";
  return err.message || err.code;
}
