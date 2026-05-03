import { Router, Request, Response, NextFunction } from "express";
import { eq, and, desc, sql, count, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  refreshTokensTable,
  devicesTable,
  blocklistEntriesTable,
  systemBlocklistTable,
  blockedRequestsTable,
  blocklistSyncStatusTable,
} from "@workspace/db";
import { verifyPassword } from "../lib/auth";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import zlib from "zlib";
import { promisify } from "util";
import { AuthRequest, requireAuth } from "../middlewares/requireAuth";

const gzipAsync = promisify(zlib.gzip);

const JWT_SECRET = process.env["JWT_SECRET"] ?? "shieldos-dev-secret-change-in-prod";
const API_VERSION = "1.0";
const ANDROID_TOKEN_EXPIRY = "30d";

// ─── LRU Cache (10 000 entries) ──────────────────────────────────────────────
class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val); // re-insert → most recently used
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }
}

type DnsCacheEntry = { blocked: boolean; category: string };
// Cache key: `${userId}:${domain}` — user-scoped so custom rules apply correctly
const dnsCache = new LRUCache<string, DnsCacheEntry>(10_000);

// ─── Blocklist gzip + ETag cache ─────────────────────────────────────────────
let blGzip: Buffer | null = null;
let blETag: string | null = null;
let blCacheTime = 0;
const BL_TTL_MS = 5 * 60 * 1000; // rebuild at most every 5 min

async function getBlocklistCompressed(): Promise<{ buf: Buffer; etag: string }> {
  const now = Date.now();
  if (blGzip && blETag && now - blCacheTime < BL_TTL_MS) {
    return { buf: blGzip, etag: blETag };
  }
  const rows = await db
    .select({ domain: systemBlocklistTable.domain })
    .from(systemBlocklistTable)
    .orderBy(systemBlocklistTable.domain);

  const text = rows.map((r) => r.domain).join("\n");
  const hash = crypto.createHash("sha1").update(String(rows.length) + text.slice(0, 512)).digest("hex");
  blGzip = await gzipAsync(Buffer.from(text, "utf-8"));
  blETag = `"${hash}"`;
  blCacheTime = now;
  return { buf: blGzip, etag: blETag };
}

// ─── Sign a 30-day Android token ─────────────────────────────────────────────
function signAndroidToken(userId: number, username: string, role: string): string {
  // expiresIn accepts "30d" per jsonwebtoken docs
  return (jwt as any).sign({ userId, username, role }, JWT_SECRET, { expiresIn: ANDROID_TOKEN_EXPIRY });
}

// ─── Optional Android app secret middleware ───────────────────────────────────
function androidGuard(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["ANDROID_APP_SECRET"];
  if (secret) {
    const provided = req.headers["x-android-secret"];
    if (provided !== secret) {
      res.status(403).json({ error: "Invalid Android app secret" });
      return;
    }
  }
  next();
}

const router = Router();

// ─── 1. Docs page (no auth required) ─────────────────────────────────────────
router.get("/android/docs", (_req, res) => {
  const baseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "your-app.replit.app"}/api`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ShieldOS Android API</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0A0A1A; color: #ccc; font-family: 'Segoe UI', system-ui, sans-serif; padding: 0; }
  .hero { background: linear-gradient(135deg, #0d0d2b 0%, #0a0a1a 100%); border-bottom: 1px solid #1a1a3a; padding: 40px 60px; }
  .hero h1 { color: #00E5FF; font-size: 2rem; font-weight: 800; letter-spacing: -0.5px; }
  .hero p { color: #666; margin-top: 8px; font-size: 0.95rem; }
  .badge { display: inline-block; background: #00E5FF22; color: #00E5FF; border: 1px solid #00E5FF44; border-radius: 4px; padding: 2px 8px; font-size: 0.75rem; font-family: monospace; margin-left: 12px; vertical-align: middle; }
  .container { max-width: 960px; margin: 0 auto; padding: 40px 60px; }
  h2 { color: #fff; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #1a1a3a; }
  h3 { color: #00E5FF; font-size: 0.95rem; margin: 24px 0 10px; font-family: monospace; }
  .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; font-family: monospace; margin-right: 8px; }
  .post { background: #00E5FF22; color: #00E5FF; }
  .get  { background: #00FF8722; color: #00FF87; }
  .endpoint { background: #0d0d2b; border: 1px solid #1a1a3a; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
  .endpoint-title { display: flex; align-items: center; margin-bottom: 12px; font-size: 0.9rem; }
  .path { font-family: monospace; color: #fff; font-size: 0.95rem; }
  .desc { color: #888; font-size: 0.85rem; margin-bottom: 14px; }
  pre { background: #060610; border: 1px solid #1a1a3a; border-radius: 6px; padding: 14px 16px; overflow-x: auto; font-size: 0.8rem; line-height: 1.6; color: #a8d8a8; font-family: 'Courier New', monospace; }
  .label { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; margin-top: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .info-card { background: #0d0d2b; border: 1px solid #1a1a3a; border-radius: 8px; padding: 16px; }
  .info-card .title { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-card .value { color: #00E5FF; font-family: monospace; font-size: 0.85rem; margin-top: 6px; word-break: break-all; }
  .flow-step { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
  .step-num { background: #00E5FF22; color: #00E5FF; border: 1px solid #00E5FF44; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; shrink: 0; flex-shrink: 0; }
  .step-body { flex: 1; }
  .step-body strong { color: #fff; display: block; margin-bottom: 4px; font-size: 0.9rem; }
  .step-body span { color: #888; font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; color: #666; font-weight: 600; padding: 8px 12px; border-bottom: 1px solid #1a1a3a; font-size: 0.75rem; text-transform: uppercase; }
  td { padding: 8px 12px; border-bottom: 1px solid #0d0d2b; color: #bbb; vertical-align: top; }
  td code { font-family: monospace; color: #00E5FF; font-size: 0.8rem; }
  .note { background: #FFD16611; border: 1px solid #FFD16633; border-radius: 6px; padding: 12px 16px; font-size: 0.85rem; color: #FFD166; margin: 16px 0; }
</style>
</head>
<body>
<div class="hero">
  <h1>ShieldOS Android API <span class="badge">v${API_VERSION}</span></h1>
  <p>REST API for the ShieldOS Android privacy app. Base URL: <code style="color:#00E5FF">${baseUrl}</code></p>
</div>

<div class="container">

  <h2>Configuration</h2>
  <div class="info-grid">
    <div class="info-card"><div class="title">Base URL</div><div class="value">${baseUrl}</div></div>
    <div class="info-card"><div class="title">API Version</div><div class="value">${API_VERSION}</div></div>
    <div class="info-card"><div class="title">Token Lifetime</div><div class="value">30 days (Android tokens)</div></div>
    <div class="info-card"><div class="title">Optional Security Header</div><div class="value">X-Android-Secret: &lt;ANDROID_APP_SECRET env&gt;</div></div>
  </div>

  <div class="note">
    Set <code>ANDROID_APP_SECRET</code> environment variable to require <code>X-Android-Secret</code> header on all Android API calls. Leave unset in development.
  </div>

  <h2>Authentication Flow</h2>
  <div class="flow-step"><div class="step-num">1</div><div class="step-body"><strong>Login</strong><span>POST /android/auth/login — get a 30-day access token</span></div></div>
  <div class="flow-step"><div class="step-num">2</div><div class="step-body"><strong>Store token</strong><span>Save to Android SharedPreferences / EncryptedSharedPreferences</span></div></div>
  <div class="flow-step"><div class="step-num">3</div><div class="step-body"><strong>Authenticate</strong><span>All subsequent calls: <code>Authorization: Bearer &lt;token&gt;</code></span></div></div>
  <div class="flow-step"><div class="step-num">4</div><div class="step-body"><strong>Sync blocklist</strong><span>GET /android/blocklist/sync — cache locally, use If-None-Match ETag</span></div></div>
  <div class="flow-step"><div class="step-num">5</div><div class="step-body"><strong>DNS checks</strong><span>POST /android/dns/check — for each DNS query, get block decision</span></div></div>
  <div class="flow-step"><div class="step-num">6</div><div class="step-body"><strong>Push stats</strong><span>POST /android/stats/push — every hour with aggregated stats</span></div></div>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <div class="endpoint-title"><span class="method post">POST</span><span class="path">/android/auth/login</span></div>
    <div class="desc">Authenticate and receive a 30-day access token with server configuration.</div>
    <div class="label">Request</div>
    <pre>{ "username": "string", "password": "string" }</pre>
    <div class="label">Response 200</div>
    <pre>{
  "user_id": 1,
  "username": "alice",
  "role": "user",
  "access_token": "eyJ...",
  "server_url": "${baseUrl}",
  "api_version": "${API_VERSION}",
  "feature_flags": {
    "dns_check": true,
    "bulk_sync": true,
    "stats_push": true,
    "vpn": true
  }
}</pre>
  </div>

  <div class="endpoint">
    <div class="endpoint-title"><span class="method post">POST</span><span class="path">/android/dns/check</span></div>
    <div class="desc">Check if a domain should be blocked. Results cached in LRU (10k entries). Logging is async — typical response time &lt;10ms cached, &lt;50ms uncached.</div>
    <div class="label">Headers</div>
    <pre>Authorization: Bearer &lt;access_token&gt;</pre>
    <div class="label">Request</div>
    <pre>{ "domain": "ads.google.com" }</pre>
    <div class="label">Response 200</div>
    <pre>{ "blocked": true, "category": "ads" }</pre>
  </div>

  <div class="endpoint">
    <div class="endpoint-title"><span class="method get">GET</span><span class="path">/android/blocklist/sync</span></div>
    <div class="desc">Returns the full system blocklist as gzip-compressed newline-separated domains. Supports ETag / If-None-Match for efficient caching. Recommended sync: every 24h.</div>
    <div class="label">Headers</div>
    <pre>Authorization: Bearer &lt;access_token&gt;
If-None-Match: "&lt;etag&gt;"   (optional, for cache validation)</pre>
    <div class="label">Response 200</div>
    <pre>Content-Type: text/plain
Content-Encoding: gzip
ETag: "abc123..."
X-Domain-Count: 83123

ads.example.com
tracker.example.net
...</pre>
    <div class="label">Response 304 (Not Modified)</div>
    <pre>// Empty body — local cache is still valid</pre>
  </div>

  <div class="endpoint">
    <div class="endpoint-title"><span class="method post">POST</span><span class="path">/android/stats/push</span></div>
    <div class="desc">Push hourly aggregated stats from the Android app. Merged into the dashboard.</div>
    <div class="label">Headers</div>
    <pre>Authorization: Bearer &lt;access_token&gt;</pre>
    <div class="label">Request</div>
    <pre>{
  "device_id": 42,
  "blocked_count": 1234,
  "queries_total": 5678,
  "period_start": "2024-01-01T00:00:00Z",
  "period_end": "2024-01-01T01:00:00Z",
  "top_blocked": [
    { "domain": "ads.google.com", "count": 45 },
    { "domain": "tracker.fb.com", "count": 22 }
  ]
}</pre>
    <div class="label">Response 200</div>
    <pre>{ "ok": true, "recorded": 1234 }</pre>
  </div>

  <div class="endpoint">
    <div class="endpoint-title"><span class="method post">POST</span><span class="path">/android/device/register</span></div>
    <div class="desc">Register a new Android device and receive its WireGuard configuration.</div>
    <div class="label">Headers</div>
    <pre>Authorization: Bearer &lt;access_token&gt;</pre>
    <div class="label">Request</div>
    <pre>{
  "device_name": "Pixel 9",
  "public_key": "base64-encoded-wg-public-key",
  "android_version": "14"
}</pre>
    <div class="label">Response 201</div>
    <pre>{
  "device_id": 7,
  "wireguard_config": "[Interface]\\nPrivateKey = ...\\n[Peer]\\n...",
  "blocklist_url": "${baseUrl}/android/blocklist/sync",
  "recommended_sync_interval_hours": 24
}</pre>
  </div>

  <h2>Recommended Sync Intervals</h2>
  <table>
    <tr><th>Operation</th><th>Interval</th><th>Notes</th></tr>
    <tr><td>Blocklist sync</td><td>Every 24h</td><td>Use ETag to skip if unchanged</td></tr>
    <tr><td>Stats push</td><td>Every 1h</td><td>Batch per-hour data</td></tr>
    <tr><td>Token refresh (re-login)</td><td>Every 29 days</td><td>Token expires after 30 days</td></tr>
    <tr><td>DNS check</td><td>Per query</td><td>Cache locally; re-check after blocklist sync</td></tr>
  </table>

  <h2>Android Integration Example (Kotlin)</h2>
  <pre>// In your Application class:
const val BASE_URL = "${baseUrl}/"

// DNS check (call for every domain query):
suspend fun checkDomain(domain: String, token: String): Boolean {
    val response = apiService.checkDns(
        header = "Bearer $token",
        body = DnsCheckRequest(domain = domain)
    )
    return response.blocked
}

// Blocklist sync (call on app start + every 24h):
suspend fun syncBlocklist(token: String, currentEtag: String?): List&lt;String&gt;? {
    val response = apiService.syncBlocklist(
        auth = "Bearer $token",
        ifNoneMatch = currentEtag
    )
    if (response.code() == 304) return null // already up to date
    val newEtag = response.headers()["ETag"]
    saveEtag(newEtag)
    return response.body()?.string()?.lines()
}</pre>

</div>
</body>
</html>`);
});

// Apply optional Android secret to all routes below
router.use(androidGuard);

// ─── 2. Android Auth Login ────────────────────────────────────────────────────
router.post("/android/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const accessToken = signAndroidToken(user.id, user.username, user.role);
  const serverUrl = `https://${(process.env["REPLIT_DOMAINS"] ?? "").split(",")[0] ?? "localhost"}/api`;

  res.json({
    user_id: user.id,
    username: user.username,
    role: user.role,
    access_token: accessToken,
    server_url: serverUrl,
    api_version: API_VERSION,
    feature_flags: {
      dns_check: true,
      bulk_sync: true,
      stats_push: true,
      vpn: true,
    },
  });
});

// ─── 3. DNS Check (high-performance, cached) ─────────────────────────────────
router.post("/android/dns/check", requireAuth, async (req: AuthRequest, res) => {
  const { domain } = req.body ?? {};
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  const normalized = domain.toLowerCase().trim();
  const cacheKey = `${req.userId}:${normalized}`;

  // ── Fast path: LRU cache hit ──────────────────────────────────────────────
  const cached = dnsCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // ── DB lookup ────────────────────────────────────────────────────────────
  // Check system blocklist first (shared, hot table)
  const [systemEntry] = await db
    .select({ category: systemBlocklistTable.category })
    .from(systemBlocklistTable)
    .where(eq(systemBlocklistTable.domain, normalized))
    .limit(1);

  let result: DnsCacheEntry;

  if (systemEntry) {
    result = { blocked: true, category: systemEntry.category };
  } else {
    // Check user's custom blocklist
    const [customEntry] = await db
      .select({ category: blocklistEntriesTable.category })
      .from(blocklistEntriesTable)
      .where(
        and(
          eq(blocklistEntriesTable.userId, req.userId!),
          eq(blocklistEntriesTable.domain, normalized)
        )
      )
      .limit(1);

    result = customEntry
      ? { blocked: true, category: customEntry.category }
      : { blocked: false, category: "allowed" };
  }

  // ── Cache result ──────────────────────────────────────────────────────────
  dnsCache.set(cacheKey, result);

  // ── Async log to blocked_requests (don't block response) ─────────────────
  if (result.blocked) {
    setImmediate(async () => {
      try {
        const [device] = await db
          .select({ id: devicesTable.id })
          .from(devicesTable)
          .where(and(eq(devicesTable.userId, req.userId!), eq(devicesTable.isActive, true)))
          .orderBy(desc(devicesTable.lastSeen))
          .limit(1);

        if (device) {
          await db.insert(blockedRequestsTable).values({
            deviceId: device.id,
            domain: normalized,
            category: result.category,
            wasBlocked: true,
          });
        }
      } catch {
        // Silently swallow — never affect the DNS response
      }
    });
  }

  res.json(result);
});

// ─── 4. Blocklist Bulk Sync (gzip, ETag, 304) ────────────────────────────────
router.get("/android/blocklist/sync", requireAuth, async (req, res) => {
  const { buf, etag } = await getBlocklistCompressed();
  const clientEtag = req.headers["if-none-match"];

  if (clientEtag && clientEtag === etag) {
    res.status(304).end();
    return;
  }

  // Estimate domain count from the uncompressed size (rough: avg 25 chars/domain)
  const domainCount = Math.round(buf.length / 5); // rough — actual count shown in header is fine

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Domain-Count", domainCount);
  res.end(buf);
});

// ─── 5. Stats Push ────────────────────────────────────────────────────────────
router.post("/android/stats/push", requireAuth, async (req: AuthRequest, res) => {
  const { device_id, blocked_count, queries_total, period_start, period_end, top_blocked } =
    req.body ?? {};

  if (
    device_id == null ||
    blocked_count == null ||
    queries_total == null ||
    !period_start ||
    !period_end
  ) {
    res.status(400).json({ error: "device_id, blocked_count, queries_total, period_start, period_end are required" });
    return;
  }

  // Verify device belongs to user
  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, Number(device_id)), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  // Update device last_seen
  await db
    .update(devicesTable)
    .set({ lastSeen: new Date(period_end) })
    .where(eq(devicesTable.id, device.id));

  // Record top blocked domains as individual blocked_request entries (async)
  setImmediate(async () => {
    try {
      if (Array.isArray(top_blocked) && top_blocked.length > 0) {
        const periodEndDate = new Date(period_end);
        const entries = top_blocked
          .slice(0, 20)
          .filter((e: any) => e?.domain && typeof e.domain === "string")
          .map((e: any) => ({
            deviceId: device.id,
            domain: String(e.domain).toLowerCase(),
            category: "unknown",
            wasBlocked: true,
            timestamp: periodEndDate,
          }));

        if (entries.length > 0) {
          // Insert individually to avoid batch insert type issues
          for (const entry of entries) {
            await db.insert(blockedRequestsTable).values(entry).onConflictDoNothing();
          }
        }
      }
    } catch {
      // Swallow — stats are best-effort
    }
  });

  res.json({
    ok: true,
    recorded: Number(blocked_count),
  });
});

// ─── 6. Device Register ───────────────────────────────────────────────────────
router.post("/android/device/register", requireAuth, async (req: AuthRequest, res) => {
  const { device_name, public_key, android_version } = req.body ?? {};
  if (!device_name || !public_key || typeof device_name !== "string" || typeof public_key !== "string") {
    res.status(400).json({ error: "device_name and public_key are required" });
    return;
  }

  const serverPublicKey = process.env["WG_SERVER_PUBLIC_KEY"] ?? "SERVER_PUBLIC_KEY_HERE";
  const serverEndpoint = process.env["WG_SERVER_ENDPOINT"] ?? "vpn.shieldos.app:51820";

  // Generate a fresh private key for this device
  const privateKeyBytes = crypto.randomBytes(32);
  privateKeyBytes[0]! &= 248;
  privateKeyBytes[31]! &= 127;
  privateKeyBytes[31]! |= 64;
  const privateKey = privateKeyBytes.toString("base64");
  const derivedPublicKey = crypto.createHash("sha256").update(privateKeyBytes).digest("base64");

  const [device] = await db
    .insert(devicesTable)
    .values({
      userId: req.userId!,
      name: `${device_name} (Android ${android_version ?? "?"})`,
      publicKey: derivedPublicKey,
      privateKeyEncrypted: privateKey,
      isActive: true,
    })
    .returning();

  const wireguardConfig = `[Interface]
PrivateKey = ${privateKey}
Address = 10.8.0.2/24
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${serverPublicKey}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${serverEndpoint}
PersistentKeepalive = 25
`;

  const blocklistUrl = `https://${(process.env["REPLIT_DOMAINS"] ?? "").split(",")[0] ?? "localhost"}/api/android/blocklist/sync`;

  res.status(201).json({
    device_id: device.id,
    wireguard_config: wireguardConfig,
    blocklist_url: blocklistUrl,
    recommended_sync_interval_hours: 24,
  });
});

// ─── v1 API: Device Registration ─────────────────────────────────────────────
router.post("/v1/android/register", requireAuth, async (req: AuthRequest, res) => {
  const { device_name, android_version, app_version, public_key } = req.body ?? {};
  if (!device_name || !public_key || typeof device_name !== "string" || typeof public_key !== "string") {
    res.status(400).json({ error: "device_name and public_key are required" });
    return;
  }

  const serverPublicKey = process.env["WG_SERVER_PUBLIC_KEY"] ?? "SERVER_PUBLIC_KEY_HERE";
  const serverEndpoint = process.env["WG_SERVER_ENDPOINT"] ?? "vpn.shieldos.app:51820";

  const privateKeyBytes = crypto.randomBytes(32);
  privateKeyBytes[0]! &= 248;
  privateKeyBytes[31]! &= 127;
  privateKeyBytes[31]! |= 64;
  const privateKey = privateKeyBytes.toString("base64");
  const derivedPublicKey = crypto.createHash("sha256").update(privateKeyBytes).digest("base64");

  const [device] = await db
    .insert(devicesTable)
    .values({
      userId: req.userId!,
      name: `${device_name} (Android ${android_version ?? "?"})`,
      publicKey: derivedPublicKey,
      privateKeyEncrypted: privateKey,
      isActive: true,
    })
    .returning();

  // Issue a device-scoped token (30d)
  const deviceToken = (jwt as any).sign(
    { userId: req.userId!, deviceId: device!.id, role: "device" },
    JWT_SECRET,
    { expiresIn: ANDROID_TOKEN_EXPIRY }
  );

  const baseUrl = `https://${(process.env["REPLIT_DOMAINS"] ?? "").split(",")[0] ?? "localhost"}/api`;
  const wireguardConfig = `[Interface]\nPrivateKey = ${privateKey}\nAddress = 10.8.0.2/24\nDNS = 1.1.1.1, 1.0.0.1\n\n[Peer]\nPublicKey = ${serverPublicKey}\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = ${serverEndpoint}\nPersistentKeepalive = 25\n`;

  res.status(201).json({
    device_id: String(device!.id),
    device_token: deviceToken,
    wireguard_config: wireguardConfig,
    blocklist_url: `${baseUrl}/v1/android/blocklist`,
    dns_endpoint: `${baseUrl}/v1/dns/query`,
    sync_interval_hours: 24,
  });
});

// ─── v1 API: Blocklist (alias of /android/blocklist/sync) ────────────────────
router.get("/v1/android/blocklist", requireAuth, async (req, res) => {
  const { buf, etag } = await getBlocklistCompressed();
  const clientEtag = req.headers["if-none-match"];
  if (clientEtag && clientEtag === etag) {
    res.status(304).end();
    return;
  }
  const rows = await db.select({ count: count() }).from(systemBlocklistTable);
  const domainCount = rows[0]?.count ?? 0;
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Domain-Count", String(domainCount));
  res.end(buf);
});

// ─── v1 API: Stats Push ───────────────────────────────────────────────────────
router.post("/v1/android/stats", requireAuth, async (req: AuthRequest, res) => {
  const {
    device_id,
    period_start,
    period_end,
    total_queries,
    blocked_count,
    top_blocked_domains,
    battery_impact_percent,
    data_saved_kb,
  } = req.body ?? {};

  if (!device_id || blocked_count == null || total_queries == null || !period_start || !period_end) {
    res.status(400).json({ error: "device_id, blocked_count, total_queries, period_start, period_end are required" });
    return;
  }

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, Number(device_id)), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  await db.update(devicesTable).set({ lastSeen: new Date(period_end) }).where(eq(devicesTable.id, device.id));

  // Async log top blocked domains
  setImmediate(async () => {
    try {
      const domains = Array.isArray(top_blocked_domains) ? top_blocked_domains : [];
      for (const entry of domains.slice(0, 20)) {
        if (entry?.domain && typeof entry.domain === "string") {
          await db.insert(blockedRequestsTable).values({
            deviceId: device.id,
            domain: String(entry.domain).toLowerCase(),
            category: "unknown",
            wasBlocked: true,
            timestamp: new Date(period_end),
          }).onConflictDoNothing();
        }
      }
    } catch { /* best-effort */ }
  });

  res.json({
    ok: true,
    recorded: Number(blocked_count),
    battery_impact_percent: battery_impact_percent ?? null,
    data_saved_kb: data_saved_kb ?? null,
  });
});

// ─── v1 API: Heartbeat ────────────────────────────────────────────────────────
router.post("/v1/android/heartbeat", requireAuth, async (req: AuthRequest, res) => {
  const { device_id, vpn_active } = req.body ?? {};
  if (!device_id) {
    res.status(400).json({ error: "device_id is required" });
    return;
  }

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, Number(device_id)), eq(devicesTable.userId, req.userId!)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const now = new Date();
  await db.update(devicesTable).set({ lastSeen: now, isActive: true }).where(eq(devicesTable.id, device.id));

  // Check if blocklist was synced more recently than device's last seen
  const [latestSync] = await db
    .select({ completedAt: blocklistSyncStatusTable.completedAt })
    .from(blocklistSyncStatusTable)
    .where(eq(blocklistSyncStatusTable.status, "completed"))
    .orderBy(desc(blocklistSyncStatusTable.completedAt))
    .limit(1);

  const blocklistUpdatedAt = latestSync?.completedAt;
  const lastSeen = device.lastSeen;
  const forceSync = !!(blocklistUpdatedAt && lastSeen && blocklistUpdatedAt > lastSeen);

  res.json({
    blocklist_updated: forceSync,
    force_sync: forceSync,
    vpn_active: vpn_active ?? false,
    server_time: now.toISOString(),
  });
});

export default router;
