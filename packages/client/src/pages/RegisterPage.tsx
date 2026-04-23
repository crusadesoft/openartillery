import { FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { ApiError } from "../auth/authClient";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export function RegisterPage({ navigate }: Props): JSX.Element {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await register(username.trim(), password);
      navigate({ name: "home" });
    } catch (err) {
      if (err instanceof ApiError) setError(messageForError(err));
      else setError("Registration failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container">
      <form className="card" style={{ maxWidth: 420, margin: "40px auto" }} onSubmit={submit}>
        <h2>Create account</h2>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Username (3–16, letters/numbers/_)</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[A-Za-z0-9_]{3,16}"
            minLength={3}
            maxLength={16}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label>Password (min 8)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <SfxButton className="primary-btn" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Register"}
        </SfxButton>
        <SfxButton
          type="button"
          className="ghost-btn"
          onClick={() => navigate({ name: "login" })}
        >
          Already have an account? Sign in
        </SfxButton>
      </form>
    </div>
  );
}

function messageForError(err: ApiError): string {
  if (err.code === "username_taken") return "That username is taken.";
  if (err.code === "validation_failed") {
    const d = err.details as Record<string, string[]> | undefined;
    return Object.values(d ?? {}).flat().join(" · ") || "Please check your input.";
  }
  return err.message || err.code;
}
