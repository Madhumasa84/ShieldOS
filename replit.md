# ShieldOS — Privacy Command Center

## Overview

Full-stack privacy backend + admin dashboard for an Android privacy app that blocks trackers and protects user data.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Auth**: bcryptjs (password hashing) + jsonwebtoken (JWT, HS256)
- **Charts**: Recharts
- **File upload**: multer (memoryStorage, 50MB limit)

## Architecture

```
artifacts/
  api-server/       # Express REST API
  shieldos/         # React frontend dashboard
lib/
  api-spec/         # OpenAPI spec (source of truth)
  api-client-react/ # Generated React Query hooks
  api-zod/          # Generated Zod validation schemas
  db/               # Drizzle ORM schema + client
```

## Database Schema

- `users` — username + bcrypt password hash
- `refresh_tokens` — JWT refresh token rotation
- `devices` — WireGuard VPN devices per user
- `blocklist_entries` — custom domain blocklist (per-user)
- `blocked_requests` — log of blocked tracker requests
- `threat_reports` — community threat intelligence
- `threat_votes` — user upvote/downvote on threats
- `system_blocklist` — 80k+ domains from StevenBlack/AdAway (auto-synced)
- `blocklist_sync_status` — sync run history (status, total, timestamps)

## Blocklist Engine

- `startBlocklistSyncScheduler()` fires on server startup, then every 24h
- Sources: StevenBlack hosts (83k domains), AdAway (6.5k domains)
- Parses hosts-format files, categorizes domains (ads/tracking/malware/social)
- Bulk upserts in batches of 500 with ON CONFLICT DO UPDATE
- Manual trigger via `POST /v1/blocklist/sync`
- File import via `POST /v1/blocklist/import` (multipart, hosts format)

## API Routes (all under /api)

- `/v1/auth/*` — register, login, refresh, logout, me
- `/v1/vpn/*` — provision device, list configs, revoke, status
- `/v1/blocklist/check` — check domain against custom + system blocklist
- `/v1/blocklist/stats` — custom + system counts, sync status
- `/v1/blocklist/custom` — list/add/remove custom user domains
- `/v1/blocklist/system` — paginated system blocklist (search/filter)
- `/v1/blocklist/sync-status` — latest sync run details
- `/v1/blocklist/sync` — trigger manual sync (POST)
- `/v1/blocklist/import` — upload hosts .txt file (POST, multipart)
- `/v1/blocklist/blocked-requests` — blocked request log
- `/v1/threats/*` — feed, report, vote, stats
- `/v1/dashboard/*` — summary (includes system domain count), blocked chart, category breakdown

## Frontend Pages

- `/login` — Terminal-style auth (register/login)
- `/dashboard` — Stats overview, blocked chart, category pie
- `/blocklist` — System tab (83k+ domains, search/filter/paginate) + Custom tab (add/remove/import)
- `/devices` — WireGuard VPN device management + config generation
- `/threats` — Community threat feed with voting
- `/settings` — Account info

## Demo Credentials

- Username: `admin`
- Password: `shieldos123`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `JWT_SECRET` — Secret for JWT signing (defaults to dev value if not set)
- `WG_SERVER_PUBLIC_KEY` — WireGuard server public key (optional)
- `WG_SERVER_ENDPOINT` — WireGuard server endpoint (optional)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
