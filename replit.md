# Loon Proxy Dashboard

A self-hosted Music Presence cover image proxy server with a web dashboard. Runs the loon Go binary as a subprocess, proxies WebSocket (`/ws`) and image (`/loon-img`) traffic to it, and exposes a React management UI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-set by Replit DB)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, Go 1.25 (for loon binary)
- API: Express 5 + http-proxy-middleware (WebSocket & image proxy)
- DB: PostgreSQL + Drizzle ORM (persistent image history)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind v4 + shadcn/ui

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/images.ts` — `loon_images` DB table (persistent cover art history)
- `artifacts/api-server/src/lib/loon-manager.ts` — Go binary lifecycle, DB image storage
- `artifacts/api-server/src/lib/metrics.ts` — CPU/RAM/process metrics
- `artifacts/api-server/src/app.ts` — Express app, loon-img proxy middleware
- `artifacts/api-server/src/routes/loon.ts` — all /api/loon/* routes
- `artifacts/api-server/loon-bin` — compiled Go binary (built on first deploy if missing)
- `artifacts/api-server/loon-data/` — config.yml + app-config.json
- `artifacts/loon-ui/src/pages/dashboard.tsx` — main dashboard
- `artifacts/loon-ui/src/pages/settings.tsx` — config + connection details

## Architecture decisions

- **Go binary as subprocess**: loon runs on internal port 8889; Express proxies `/ws` (WebSocket) and `/loon-img` (images) to it. No Docker needed.
- **Static binary build**: `CGO_ENABLED=0 go build -ldflags='-extldflags "-static"'` required on NixOS. Build happens in `build.mjs` (non-fatal; also lazily in `ensureBinary()` on first `/api/loon/start`).
- **Persistent image history**: Cover art records are stored in PostgreSQL (`loon_images` table) so history survives restarts. Size in bytes captured from proxy `content-length` headers.
- **Real CPU metrics**: `os.cpus()` sampled every 2s in `metrics.ts`; IDLE/LOW/MEDIUM/HIGH thresholds driven by actual CPU %, not heuristics.
- **Path routing**: `/api` → Express JSON API; `/ws` → loon WebSocket; `/loon-img` → loon image server. All three paths listed in `artifact.toml`.

## Product

- START/STOP the loon proxy subprocess from the dashboard
- View live connection count, CPU load (IDLE/LOW/MEDIUM/HIGH), and expandable system metrics (CPU %, RAM, process RSS, image storage)
- Browse persistent cover art history with file sizes; click to open lightbox; clear history
- Settings page: configure username/password/cache/size + copy WebSocket URL & Frontend Base URL for Music Presence setup
- Step-by-step Music Presence client setup instructions in Settings

## Gotchas

- **Go module required**: Install `go-1.25` module before first build. If binary is missing and Go isn't installed, `startLoon()` will throw.
- **Binary not in git**: `artifacts/api-server/loon-bin` is built from source on deploy. First production deploy takes ~60–90s for the Go build step.
- **WebSocket proxying**: `/ws` path must be in `artifact.toml` paths array for the shared proxy to forward WebSocket upgrades.
- **`DATABASE_URL` required at startup**: The DB lib throws if not set. Provision the Replit DB before running.
- **Loon config regenerated on every start**: `writeLoonConfig()` overwrites `loon-data/config.yml` from `app-config.json` each time — edit via the Settings page API, not the file directly.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- loon source: https://github.com/ungive/loon
- Music Presence: https://github.com/ungive/discord-music-presence
