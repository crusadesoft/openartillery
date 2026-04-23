# Artillery — browser multiplayer artillery game

UMAG-inspired turn-based tank artillery, built for production scale. Destructible
terrain, ballistic projectiles with wind and gravity, destructible dirt, multiple
weapons, ranked MMR, private rooms, bot fill, mobile touch controls.

## Stack

| Layer          | Tech                                                                  |
| -------------- | --------------------------------------------------------------------- |
| Game render    | [Phaser 3](https://phaser.io/) + [RexUI](https://rexrainbow.github.io/phaser3-rex-notes/) |
| Menus / routing| React 18 (hash router)                                                |
| Sound          | [Howler.js](https://howlerjs.com/) (procedural WAV)                   |
| Client physics | Matter.js (via Phaser)                                                |
| Server physics | Custom heightmap + ballistic integrator (authoritative)               |
| Multiplayer    | [Colyseus 0.16](https://colyseus.io/), schema v3                      |
| Scale          | Redis-backed matchmaking + presence (`@colyseus/redis-driver` / `-presence`) |
| Persistence    | Postgres + Drizzle ORM + drizzle-kit migrations                       |
| Auth           | JWT (jose) + bcrypt, refresh-token rotation                           |
| Observability  | pino + pino-http + prom-client `/metrics`                             |
| Validation     | Zod (HTTP bodies + in-room messages)                                  |
| Security       | Helmet, CORS, express-rate-limit                                      |
| Tooling        | TypeScript, Vitest, ESLint, Prettier                                  |
| Ops            | Dockerfile + docker-compose (postgres, redis, server), GitHub Actions |

## Layout

```
packages/
  shared/   schema, DTOs (zod), modes, ELO, protocol constants
  server/   Express + Colyseus + Postgres + Redis + REST + matchmaking
  client/   Vite + React shell + Phaser game scene
```

## Local development

Prereqs: Node 20+, Docker (for Postgres + Redis), `npm install -g @playwright/cli` if
you want to drive the browser from CI.

```bash
# 1. Bring up Postgres + Redis
npm run docker:up

# 2. Install
npm install

# 3. Build shared schema once, then migrate DB
npm run build:shared
DATABASE_URL=postgres://artillery:artillery@localhost:5432/artillery \
  npm run db:migrate

# 4. Run the stack (shared watcher, Colyseus on :2567, Vite on :5173)
npm run dev
```

Open http://localhost:5173. Register or play as a guest.

### Environment

Copy `.env.example` to `.env` and fill in secrets (especially `JWT_ACCESS_SECRET`
and `JWT_REFRESH_SECRET`, both must be ≥32 chars). All env keys are validated
via zod at server startup (see `packages/server/src/config.ts`).

### Testing

```bash
npm test              # vitest: shared ELO, server physics/terrain/projectile
npm run typecheck
npm run lint
```

## Production

Build and run with Docker:

```bash
JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... \
  docker compose up --build
```

The `server` service runs two replicas by default; they share matchmaking and
presence via Redis, so a client connecting to either node can join any room on
the cluster. Horizontal scaling is a matter of `--scale server=N`.

### Observability

- `GET /metrics` exposes Prometheus metrics (HTTP histograms, room + client
  gauges, match counters).
- Structured JSON logs go to stdout via pino; pair with Loki/Vector/etc.
- Request IDs propagate via `x-request-id` for tracing.

### Security / abuse

- All auth endpoints are rate-limited (`AUTH_RATE_LIMIT_PER_MIN`).
- All public API endpoints are rate-limited (`API_RATE_LIMIT_PER_MIN`).
- In-room chat and general message traffic are rate-limited per-session.
- Bodies are capped at 64 KB; zod rejects anything malformed.
- Passwords: bcrypt-hashed; refresh tokens stored as SHA-256 hashes.
- Refresh tokens rotate on every use; a reused token invalidates the chain.
- Colyseus `allowReconnection` keeps a player's seat for 20s on network drops.

### Matchmaking & modes

- **FFA** (2–6): last tank standing, ranked.
- **Duel** (1v1): fills with a bot after 20s to avoid dead lobbies, ranked.
- **Private** (up to 6): invite-code room, unranked.

Private rooms expose a shareable URL: `#/game/private?code=ABC123`.

### Replays

Every match writes its event log (`{t, kind, ...}[]`) into Postgres
(`matches.events` JSONB). Retrieve via `GET /api/matches/:id/replay`.
Log is trimmed to 10k events to prevent pathological runs.

## Controls

Keyboard:

- `A / D` or `← / →` — drive (costs fuel)
- `W / S` or `↑ / ↓` — aim barrel
- `Q / E` — cycle weapon
- `Space` — hold to charge, release to fire

Mobile: on-screen d-pad + FIRE + weapon cycle appear on touch devices.

## Architecture notes

### Authoritative server

The server owns all physics: heightmap terrain, projectile integration,
collision detection, damage, and MMR. Clients send intent (press/release
+ discrete messages) and render server-broadcast state patches. This
prevents common cheats (teleport, wallhack, power manipulation) without
any client-side trust.

### Schema delta sync

Colyseus schema v3 diffs the room state each patch, so clients only receive
per-field changes. The heightmap is an `ArraySchema<number>`; mutating a
single column on an explosion costs one patch, not a full broadcast.

### Decorator classes compile with `useDefineForClassFields: false`

`@colyseus/schema` decorators require the TypeScript field-initialization
semantics from before ES2022 class field semantics. See `tsconfig.base.json`.

## Feedback / issues

Open an issue or PR. Please include repro steps and your Node version.
