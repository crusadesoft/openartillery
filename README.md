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

## Deploy

openartillery.net runs on a Netcup VPS that is only reachable over
Tailscale, as the machine `vps` (`100.69.65.90`).

- Checkout: `/opt/artillery`, a plain clone of this repo's `main`.
- Secrets: `/opt/artillery/.env` on the box (not in git).
- `/opt/artillery/docker-compose.override.yml` (also not in git) keeps
  Postgres and Redis off the public ports and binds the server to
  `127.0.0.1:2567`.
- Ingress: the `cloudflared` systemd service tunnels openartillery.net and
  www.openartillery.net to `127.0.0.1:2567` (`/etc/cloudflared/config.yml`).
  There is no nginx or Caddy.
- CI only lints, tests and builds the image; it does not deploy.

To ship what's on `main` (push first), from a machine signed in to Tailscale:

```bash
ssh root@100.69.65.90 'cd /opt/artillery && docker tag artillery-server:latest artillery-server:rollback && git fetch && git reset --hard origin/main && docker compose up -d --build server'
```

Tailscale SSH may ask you to approve the login in a browser first. The
build takes a few minutes while the old container keeps serving, then
compose swaps containers, so the site is down for a few seconds. The
server applies database migrations when it boots.

The Colyseus monitor (`/colyseus`, when `ENABLE_COLYSEUS_MONITOR=true`) and
`/metrics` (when `METRICS_TOKEN` is unset) only answer requests made from the
box itself and return 404 through Cloudflare. To open the monitor, forward the
port and browse to http://localhost:2567/colyseus/:

```bash
ssh -N -L 2567:127.0.0.1:2567 root@100.69.65.90
```

To roll back to the image that was running before the last deploy:

```bash
ssh root@100.69.65.90 'cd /opt/artillery && docker tag artillery-server:rollback artillery-server:latest && docker compose up -d --no-build --force-recreate server'
```

## Contributing

Open an issue or PR. Include repro steps and your Node version.
