import type { AuthTokens, LoadoutSelection, PublicProfile } from "@artillery/shared";

const ACCESS_KEY = "artillery:accessToken";
const REFRESH_KEY = "artillery:refreshToken";
const USER_KEY = "artillery:user";

export interface AuthSession {
  user: PublicProfile;
  tokens: AuthTokens;
}

export const authStorage = {
  load(): AuthSession | null {
    try {
      const user = localStorage.getItem(USER_KEY);
      const access = localStorage.getItem(ACCESS_KEY);
      const refresh = localStorage.getItem(REFRESH_KEY);
      if (!user || !access || !refresh) return null;
      return {
        user: JSON.parse(user) as PublicProfile,
        tokens: {
          accessToken: access,
          refreshToken: refresh,
          expiresIn: 0,
        },
      };
    } catch {
      return null;
    }
  },
  save(session: AuthSession): void {
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    localStorage.setItem(ACCESS_KEY, session.tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, session.tokens.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function request<T>(path: string, init: RequestInit & { auth?: string } = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.auth ? { Authorization: `Bearer ${init.auth}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* empty */ }
    const err = body as { error?: string; message?: string; details?: unknown } | undefined;
    throw new ApiError(res.status, err?.error ?? "http_error", err?.message, err?.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const authApi = {
  register(username: string, password: string) {
    return request<{ user: PublicProfile; tokens: AuthTokens }>(`/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string) {
    return request<{ user: PublicProfile; tokens: AuthTokens }>(`/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  refresh(refreshToken: string) {
    return request<{ user: PublicProfile; tokens: AuthTokens }>(`/auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
  me(accessToken: string) {
    return request<{ user: PublicProfile }>(`/auth/me`, { auth: accessToken });
  },
  logout(accessToken: string) {
    return request<void>(`/auth/logout`, { method: "POST", auth: accessToken });
  },
};

export const api = {
  leaderboard(limit = 50) {
    return request<{ entries: import("@artillery/shared").LeaderboardEntry[] }>(
      `/api/leaderboard?limit=${limit}`,
    );
  },
  profile(username: string) {
    return request<{ profile: PublicProfile }>(`/api/profile/${encodeURIComponent(username)}`);
  },
  recentMatches(limit = 20) {
    return request<{ matches: import("@artillery/shared").MatchSummary[] }>(
      `/api/matches/recent?limit=${limit}`,
    );
  },
  rooms() {
    return request<{ lobbies: import("@artillery/shared").LobbySummary[] }>(
      `/api/rooms`,
    );
  },
  getLoadout(accessToken: string) {
    return request<{ selection: LoadoutSelection; ownedSkus: string[] }>(
      `/api/me/loadout`,
      { auth: accessToken },
    );
  },
  saveLoadout(accessToken: string, selection: Partial<LoadoutSelection>) {
    return request<{ selection: LoadoutSelection }>(`/api/me/loadout`, {
      method: "PUT",
      auth: accessToken,
      body: JSON.stringify(selection),
    });
  },
  getTanks(accessToken?: string) {
    return request<{ tanks: TankListing[] }>(`/api/shop/tanks`, {
      ...(accessToken ? { auth: accessToken } : {}),
    });
  },
  checkout(accessToken: string, sku: string) {
    return request<{ url: string }>(`/api/shop/checkout`, {
      method: "POST",
      auth: accessToken,
      body: JSON.stringify({ sku }),
    });
  },
};

export interface TankListing {
  sku: string;
  label: string;
  blurb: string;
  priceCents: number;
  body: string;
  turret: string;
  barrel: string;
  pattern: string;
  paint: { primary: number; accent: number; pattern: number };
  bonusDecals: string[];
  owned: boolean;
}
