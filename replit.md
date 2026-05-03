# ShieldOS — Privacy Command Center

## Overview

Full-stack privacy backend + admin dashboard for an Android privacy app that blocks trackers and protects user data. Supports full multi-user system with admin and user roles.

Features: dashboard, blocklist management, device management, threat feed, analytics (6 recharts charts, PDF/CSV/JSON export), notifications (SSE, alert rules, webhooks), scheduled reports, Android API bridge, DNS engine, admin user management.

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

- `users` — username, bcrypt password hash, `role` (admin|user), `lastLoginAt`, `isActive`
- `refresh_tokens` — JWT refresh token rotation
- `devices` — WireGuard VPN devices per user (`last_seen` tracks device activity)
- `blocklist_entries` — custom domain blocklist (per-user)
- `blocked_requests` — full DNS query log: `device_id`, `domain`, `category`, `was_blocked`, `timestamp`
- `threat_reports` — community threat intelligence
- `threat_votes` — user upvote/downvote on threats
- `system_blocklist` — 83k+ domains from StevenBlack/AdAway (auto-synced)
- `blocklist_sync_status` — sync run history (status, total, timestamps)

## User Roles

- **admin**: sees all devices + global stats across all users; access to admin routes; admin badge in sidebar
- **user**: sees only own devices + own stats; no access to admin routes
- Role is stored in JWT payload (`role` claim) and in `localStorage` (`shieldos_role`)
- `requireAdmin` middleware enforces admin-only routes

## Blocklist Engine

- `startBlocklistSyncScheduler()` fires on server startup, then every 24h
- Sources: StevenBlack hosts (83k domains), AdAway (6.5k domains)
- Parses hosts-format files, categorizes domains (ads/tracking/malware/social)
- Bulk upserts in batches of 500 with ON CONFLICT DO UPDATE

## Export Features

- **PDF Report** — `GET /api/v1/export/report/pdf`: 30-day report with stats, bar chart, category breakdown, top 20 domains, active devices list. Uses pdfkit (marked external in esbuild).
- **Hosts File** — `GET /api/v1/export/blocklist/hosts`: full combined blocklist (custom + system, 83k+ domains) in `0.0.0.0 domain` format.
- **CSV Export** — `GET /api/v1/export/blocklist/csv`: domain, category, source, added_at columns.
- **Device Config Re-download** — `GET /api/v1/devices/:deviceId/config`: regenerates WireGuard `.conf` from stored private key; only if device belongs to requesting user.
- **ZIP Data Export** — `GET /api/v1/export/all`: profile.json, devices.json, custom_blocklist.json, custom_blocklist.csv, blocked_requests.json.
- **Delete Account** — `DELETE /api/v1/export/account`: permanently wipes user + all cascaded data (devices, blocklist, blocked requests, refresh tokens).

## API Routes (all under /api)

- `/v1/auth/register` — creates user-role account; returns `{ userId, username, role, accessToken, refreshToken }`
- `/v1/auth/login` — returns same + updates `lastLoginAt`
- `/v1/auth/refresh` — rotates token, returns role
- `/v1/auth/logout` — revokes refresh token
- `/v1/auth/me` — returns current user profile with role
- `/v1/vpn/*` — provision device, list configs, revoke, status
- `/v1/blocklist/*` — check, stats, custom list, system list, sync, import
- `/v1/log/request` — Android DNS query logger
- `/v1/stats/dashboard` — admin=global stats, user=own stats; includes `is_admin` flag
- `/v1/threats/*` — feed, report, vote, stats
- `/v1/dashboard/*` — legacy summary/chart endpoints
- `/v1/admin/users` — GET list all users (admin only)
- `/v1/admin/users/:id/role` — PATCH promote/demote (admin only)
- `/v1/admin/users/:id/status` — PATCH activate/deactivate (admin only, cannot touch admin accounts)
- `/v1/admin/users/:id/reset-password` — POST returns temp password (admin only)

## Frontend Pages

- `/login` — Terminal-style login; "Request new operator profile" links to /register
- `/register` — Dedicated registration page: alphanumeric username validation, password strength meter (4-segment bar + requirements checklist), confirm password, "Already have a profile? Login" link
- `/dashboard` — Live stats (auto-refresh 30s, animated counters), hourly chart, category pie, top 10 blocked domains; admin sees global stats
- `/blocklist` — System tab (83k+ domains) + Custom tab (add/remove/import)
- `/devices` — WireGuard VPN device management + config generation
- `/threats` — Community threat feed with voting
- `/settings` — Profile tab (shows role badge); admin-only "Users" tab with full operator roster management (promote/demote, activate/deactivate, reset password + copy to clipboard)

## Android API Layer

All Android endpoints live under `/api/android/*` (no `/v1/` prefix). Route file: `artifacts/api-server/src/routes/android.ts`.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/android/auth/login` | none | 30-day JWT + server config + feature_flags |
| POST | `/android/dns/check` | Bearer | Block-check domain; LRU cache (10k entries), async DB log |
| GET  | `/android/blocklist/sync` | Bearer | Full system blocklist, gzip-compressed, ETag + 304 support |
| POST | `/android/stats/push` | Bearer | Hourly aggregated stats from device |
| POST | `/android/device/register` | Bearer | Register device, returns WireGuard config |
| GET  | `/android/docs` | none | HTML developer documentation page |

### Implementation Notes

- **LRU cache**: 10k-entry inline implementation (no external package). Cache key: `${userId}:${domain}`.
- **Blocklist gzip cache**: rebuilt every 5 min max; ~1.6MB gzip for 83k+ domains.
- **ETag 304**: `If-None-Match` header checked against SHA-1 of domain list.
- **Async DNS logging**: `setImmediate()` used so DB insert never blocks the DNS response.
- **30-day tokens**: `jwt.sign(..., { expiresIn: "30d" })` — separate from web 15min access tokens.
- **ANDROID_APP_SECRET**: optional env var; if set, all `/android/*` routes require `X-Android-Secret` header match. Docs page is exempt.
- `REPLIT_DOMAINS` env used to build `server_url` and `blocklist_url` in responses.

## Demo Credentials

- Username: `admin` / Password: `shieldos123` (role: admin)
- New users registered via /register get role: user

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
- `ANDROID_APP_SECRET` — Optional shared secret; if set, all `/android/*` routes require `X-Android-Secret: <value>` header

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
