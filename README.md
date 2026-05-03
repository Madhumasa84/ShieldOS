# ShieldOS

**Block every tracker. Own your privacy.**

ShieldOS is an open-source, self-hosted privacy backend + admin dashboard for Android. It blocks ads, trackers, and malware at the DNS level — no VPN slowdowns, no data sold, full control.

---

## Features

- **80,000+ Domains Blocked** — updated every 24 hours from StevenBlack, AdAway, and curated threat feeds
- **Real-Time DNS Protection** — sub-millisecond in-memory DNS filtering
- **Per-Device Control** — manage multiple Android devices from one dashboard
- **Full Analytics** — 6 interactive charts: time series, categories, top domains, per-device, block rate trend, threat timeline
- **Exportable Reports** — PDF, CSV, and JSON exports with scheduled delivery (weekly / monthly)
- **Threat Intelligence** — community-reported malicious domains with voting and verification
- **Notifications** — real-time alerts via SSE, webhook delivery, and configurable alert rules
- **Admin Dashboard** — manage users, devices, blocklists, and system health
- **Production Hardened** — Helmet.js security headers, tiered rate limiting, env validation, global error handling

---

## Quick Start (Self-Hosted)

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- pnpm 9+

### 1. Clone & install

```bash
git clone https://github.com/Madhumasa84/ShieldOS.git
cd ShieldOS
pnpm install
```

### 2. Set environment variables

Copy and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend publishable key |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `NODE_ENV` | Yes | `production` or `development` |
| `SESSION_SECRET` | Recommended | Express session secret |

The server validates all required variables on startup and exits with a clear error if any are missing.

### 3. Run database migrations

```bash
pnpm --filter @workspace/db run migrate
```

### 4. Start the server

```bash
# Development
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/shieldos run dev

# Production build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

---

## Android App Setup

1. Open the ShieldOS dashboard → **Android Setup** tab
2. Copy your server's Private DNS endpoint URL
3. On your Android device: **Settings → Network → Private DNS**
4. Enter your ShieldOS server URL
5. Every DNS query now routes through ShieldOS — trackers blocked automatically

---

## API Documentation

Interactive Swagger UI is available at `/api-docs` inside the dashboard.

Base URL: `https://your-domain/api/v1`

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

- **Helmet.js** — HSTS, CSP, X-Frame-Options: DENY, noSniff, Referrer-Policy, Permissions-Policy
- **Rate limiting** — tiered limits per endpoint type via express-rate-limit
- **Error handling** — stack traces never exposed in production
- **Environment validation** — hard exit on missing/invalid config at startup
- **Auth** — Clerk-powered authentication (OAuth + email/password)

---

## Tech Stack

- **Backend**: Node.js 24 + Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui
- **Auth**: Clerk
- **Charts**: Recharts
- **PDF generation**: PDFKit
- **Security**: Helmet.js + express-rate-limit
- **Monorepo**: pnpm workspaces

---

## Screenshots

| Landing | Dashboard | Analytics |
|---|---|---|
| *(coming soon)* | *(coming soon)* | *(coming soon)* |

---

## Contributing

Contributions are welcome! Please open an issue or pull request.

---

## Author

**Madhusudhanan G**
- GitHub: [@Madhumasa84](https://github.com/Madhumasa84)

---

## License

MIT — use it, fork it, ship it.
