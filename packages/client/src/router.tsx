import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "register" }
  | { name: "play" }
  | { name: "leaderboard" }
  | { name: "settings" }
  | { name: "customize" }
  | { name: "arsenal" }
  | { name: "about" }
  | { name: "profile"; username: string }
  | {
      name: "game";
      mode: string;
      inviteCode?: string;
      botCount?: number;
      botDifficulty?: string;
      biome?: string;
    };

function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = h.split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  switch (parts[0]) {
    case "login":
      return { name: "login" };
    case "register":
      return { name: "register" };
    case "play":
      return { name: "play" };
    case "leaderboard":
      return { name: "leaderboard" };
    case "settings":
      return { name: "settings" };
    case "customize":
      return { name: "customize" };
    case "arsenal":
      return { name: "arsenal" };
    case "about":
      return { name: "about" };
    case "profile":
      return { name: "profile", username: parts[1] ?? "" };
    case "game": {
      const mode = parts[1] ?? "ffa";
      const code = params.get("code") ?? undefined;
      const bots = params.get("bots");
      const diff = params.get("diff") ?? undefined;
      const biome = params.get("biome") ?? undefined;
      return {
        name: "game",
        mode,
        ...(code ? { inviteCode: code } : {}),
        ...(bots ? { botCount: Number(bots) } : {}),
        ...(diff ? { botDifficulty: diff } : {}),
        ...(biome ? { biome } : {}),
      };
    }
    default:
      return { name: "home" };
  }
}

function routeToHash(route: Route): string {
  switch (route.name) {
    case "home": return "#/";
    case "login": return "#/login";
    case "register": return "#/register";
    case "play": return "#/play";
    case "leaderboard": return "#/leaderboard";
    case "settings": return "#/settings";
    case "customize": return "#/customize";
    case "arsenal": return "#/arsenal";
    case "about": return "#/about";
    case "profile": return `#/profile/${encodeURIComponent(route.username)}`;
    case "game": {
      const qs: string[] = [];
      if (route.inviteCode) qs.push(`code=${encodeURIComponent(route.inviteCode)}`);
      if (route.botCount) qs.push(`bots=${route.botCount}`);
      if (route.botDifficulty) qs.push(`diff=${route.botDifficulty}`);
      if (route.biome) qs.push(`biome=${route.biome}`);
      return `#/game/${route.mode}${qs.length ? `?${qs.join("&")}` : ""}`;
    }
  }
}

export function useRouter(): { route: Route; navigate: (r: Route) => void } {
  const [route, setRoute] = useState<Route>(() => {
    // Deep links: the server always serves index.html for any path (SPA
    // fallback), so a visitor landing on https://.../play has no hash.
    // Promote the pathname into the hash route so external links work.
    if (!window.location.hash && window.location.pathname !== "/") {
      const promoted = `#${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", `/${promoted}`);
    }
    return parseHash(window.location.hash);
  });
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = routeToHash(r);
  }, []);
  return { route, navigate };
}
