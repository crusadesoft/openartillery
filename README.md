# OpenArtillery

Free multiplayer artillery game that runs in any modern browser. Turn-based
tank combat with destructible terrain, wind, and gravity. Free-for-all,
duel, private invite lobbies, and practice against AI bots. Ranked play
updates MMR and a public leaderboard.

Play at **[openartillery.net](https://openartillery.net)**.

## Why

Browser-native turn-based tank artillery, authoritative server — no
cheating, no desync, no install.

## Quick start

```bash
# 1. Bring up Postgres + Redis
npm run docker:up

# 2. Install + build shared types
npm install
npm run build:shared

# 3. Apply schema
DATABASE_URL=postgres://artillery:artillery@localhost:5432/artillery \
  npm run db:migrate -w @artillery/server

# 4. Run the stack (shared watcher, server on :2567, client on :5173)
npm run dev
```

Open <http://localhost:5173>. Register an account or play as a guest.

Copy `.env.example` → `.env` and set `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`
(≥32 chars each). All env keys are zod-validated at boot.

## Tests

```bash
npm test            # physics, ELO, projectile, terrain
npm run typecheck
npm run lint
```

## Production

```bash
JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... docker compose up -d --build
```

The `server` container fronts Colyseus; Postgres + Redis back it. Put a
reverse proxy (Cloudflare Tunnel, nginx, Caddy) in front for TLS.

## Contributing

Open an issue or PR. Include repro steps and your Node version.
