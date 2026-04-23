import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi, authStorage, ApiError, type AuthSession } from "./authClient";
import type { PublicProfile } from "@artillery/shared";

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (u: PublicProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(() => authStorage.load());
  const [loading, setLoading] = useState<boolean>(true);
  const refreshing = useRef<Promise<void> | null>(null);

  const setAndPersist = useCallback((next: AuthSession | null) => {
    if (next) authStorage.save(next);
    else authStorage.clear();
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return refreshing.current;
    const current = authStorage.load();
    if (!current) {
      setAndPersist(null);
      return;
    }
    const p = (async () => {
      try {
        const { user, tokens } = await authApi.refresh(current.tokens.refreshToken);
        setAndPersist({ user, tokens });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAndPersist(null);
        } else {
          throw err;
        }
      }
    })();
    refreshing.current = p;
    try {
      await p;
    } finally {
      refreshing.current = null;
    }
  }, [setAndPersist]);

  // On mount: verify we still have a valid session.
  useEffect(() => {
    let alive = true;
    (async () => {
      const current = authStorage.load();
      if (!current) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await authApi.me(current.tokens.accessToken);
        if (!alive) return;
        setAndPersist({ user, tokens: current.tokens });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            await refresh();
          } catch {
            setAndPersist(null);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh, setAndPersist]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await authApi.login(username, password);
      setAndPersist(result);
    },
    [setAndPersist],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const result = await authApi.register(username, password);
      setAndPersist(result);
    },
    [setAndPersist],
  );

  const logout = useCallback(async () => {
    const s = authStorage.load();
    if (s) {
      try { await authApi.logout(s.tokens.accessToken); } catch { /* ignore */ }
    }
    setAndPersist(null);
  }, [setAndPersist]);

  const updateUser = useCallback(
    (user: PublicProfile) => {
      const current = authStorage.load();
      if (!current) return;
      setAndPersist({ ...current, user });
    },
    [setAndPersist],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, login, register, logout, refresh, updateUser }),
    [session, loading, login, register, logout, refresh, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
