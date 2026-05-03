# ShieldOS

**Block every tracker. Own your privacy.**

ShieldOS is an open-source, self-hosted privacy backend + admin dashboard for Android. It blocks ads, trackers, and malware at the DNS level — no VPN slowdowns, no data sold, full control.

---

## Features

- **80,000+ Domains Blocked** — updated every 24 hours from StevenBlack, AdAway, and curated threat feeds
- **Real-Time DNS Protection** — sub-millisecond filtering with in-memory cache
- **Per-Device Control** — manage multiple Android devices from one dashboard
- **Full Analytics** — 6 interactive charts (time series, categories, top domains, per-device, threats)
- **Exportable Reports** — PDF, CSV, and JSON exports with scheduled delivery
- **Threat Intelligence** — community-reported malicious domains with voting and verification
- **Notifications** — real-time alerts via SSE with webhook delivery and configurable rules
- **Admin Dashboard** — manage users, devices, blocklists, and system health
- **Production Hardened** — rate limiting, Helmet.js security headers, env validation, global error handling

---

## Quick Deploy (Replit)

1. Fork this project on Replit
2. Set the required environment variables (see below)
3. Click **Deploy** — the server starts automatically

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend publishable key |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `NODE_ENV` | Yes | `production` or `development` |
| `SESSION_SECRET` | Recommended | Express session secret |

The server validates all required variables on startup and exits with a clear error message if any are missing.

---

## Android App Setup

1. Open the ShieldOS dashboard → **Android Setup** tab
2. Copy your server's DNS endpoint URL
3. On your Android device: **Settings → Network → Private DNS**
4. Enter your ShieldOS server URL
5. All DNS queries now route through ShieldOS

---

## API Documentation

Interactive API docs are available at `/api-docs` in the dashboard (Swagger UI).

Base URL: `https://your-domain/api/v1`

Key endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/v1/health` | Liveness probe |
| `GET /api/v1/health/detailed` | Full system health (admin) |
| `POST /api/v1/android/query` | DNS query resolution |
| `GET /api/v1/analytics/overview` | Analytics overview |
| `GET /api/v1/reports/generate` | Generate PDF/CSV/JSON report |
| `GET /api/v1/notifications` | Notification history |

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| Auth endpoints | 10 req / 15 min per IP |
| General API | 300 req / min per user |
| DNS queries | 10,000 req / min per device |
| Report generation | 10 req / hour per user |

All rate-limited responses include a `Retry-After` header.

---

## Security

- **Helmet.js** — HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, Permissions-Policy
- **Rate limiting** — tiered limits per endpoint type
- **Error handling** — stack traces never exposed in production
- **Environment validation** — hard exit on missing/invalid config
- **Auth** — Clerk-powered authentication with JWT + httpOnly cookie session

---

## Screenshots

| Dashboard | Analytics | Threat Feed |
|---|---|---|
| *(coming soon)* | *(coming soon)* | *(coming soon)* |

---

## Tech Stack

- **Backend**: Node.js 24 + Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui
- **Auth**: Clerk (OAuth, email/password)
- **Charts**: Recharts
- **PDF generation**: PDFKit
- **Security**: Helmet.js + express-rate-limit
- **Monorepo**: pnpm workspaces

---

## License

MIT — use it, fork it, ship it.
