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
    <div className="container enlistment-page">
      <form className="scene-enlistment" onSubmit={submit}>
        <span className="paperclip" aria-hidden />
        <span className="form-stamp"><span className="stamp">Processing</span></span>
        <div className="form-header">
          <span className="dossier-tab">Enlistment · New Operator</span>
        </div>
        <h1 className="form-title">Enlistment papers</h1>
        <p className="form-tagline">Fill out, sign, file with command.</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Callsign (3–16, letters/numbers/_)</label>
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
          {pending ? "Filing…" : "File enlistment"}
        </SfxButton>
        <SfxButton
          type="button"
          className="ghost-btn form-link"
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
