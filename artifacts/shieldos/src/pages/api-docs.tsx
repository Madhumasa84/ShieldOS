import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, ChevronDown, ChevronRight, Code2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-muted-foreground hover:text-primary"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast({ title: "Copied!" });
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    POST: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
    DELETE: "text-red-400 bg-red-400/10 border-red-400/30",
    PATCH: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold font-mono ${colors[method] ?? "text-muted-foreground"}`}>
      {method}
    </span>
  );
}

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  auth: boolean;
  request?: object;
  response: object | string;
  kotlin?: string;
}

const BASE = "{BASE_URL}";

const endpoints: Endpoint[] = [
  {
    method: "POST",
    path: "/android/auth/login",
    summary: "Authenticate and receive a 30-day device token",
    auth: false,
    request: { username: "alice", password: "••••••••" },
    response: {
      user_id: 1,
      username: "alice",
      role: "user",
      access_token: "eyJ...",
      server_url: "https://your-server/api",
      api_version: "1.0",
      feature_flags: { dns_check: true, bulk_sync: true, stats_push: true, vpn: true },
    },
    kotlin: `suspend fun login(username: String, password: String) {
    val resp = api.login(LoginRequest(username, password))
    prefs.saveToken(resp.access_token)
    prefs.saveServerUrl(resp.server_url)
}`,
  },
  {
    method: "POST",
    path: "/v1/android/register",
    summary: "Register a new device and receive its WireGuard config + device token",
    auth: true,
    request: {
      device_name: "Pixel 9",
      android_version: "14",
      app_version: "1.0.0",
      public_key: "base64-encoded-wg-public-key",
    },
    response: {
      device_id: "42",
      device_token: "eyJ...",
      wireguard_config: "[Interface]\\nPrivateKey = ...\\n[Peer]\\n...",
      blocklist_url: "https://your-server/api/v1/android/blocklist",
      dns_endpoint: "https://your-server/api/v1/dns/query",
      sync_interval_hours: 24,
    },
    kotlin: `suspend fun registerDevice(name: String, publicKey: String) {
    val resp = api.registerDevice(
        DeviceRegisterRequest(
            device_name = name,
            android_version = Build.VERSION.RELEASE,
            app_version = BuildConfig.VERSION_NAME,
            public_key = publicKey
        ),
        auth = "Bearer \${prefs.getToken()}"
    )
    prefs.saveDeviceId(resp.device_id)
    prefs.saveDeviceToken(resp.device_token)
    VpnManager.importWireguardConfig(resp.wireguard_config)
}`,
  },
  {
    method: "GET",
    path: "/v1/android/blocklist",
    summary: "Download full blocklist (gzip, ETag/304 cache supported)",
    auth: true,
    response: "text/plain — one domain per line (gzip compressed)\n\nHeaders:\n  ETag: \"abc123\"\n  X-Domain-Count: 88415\n  Content-Encoding: gzip",
    kotlin: `suspend fun syncBlocklist(currentEtag: String?) {
    val resp = api.getBlocklist(
        auth = "Bearer \${prefs.getToken()}",
        ifNoneMatch = currentEtag
    )
    if (resp.code() == 304) return  // cache still valid
    val newEtag = resp.headers()["ETag"]
    prefs.saveBlocklistEtag(newEtag)
    val domains = resp.body()?.string()?.lines() ?: return
    BlocklistDatabase.replace(domains)
}`,
  },
  {
    method: "POST",
    path: "/v1/dns/query",
    summary: "Check if a domain is blocked — sub-2ms response with in-memory cache",
    auth: true,
    request: { domain: "ads.doubleclick.net", device_id: "42" },
    response: { blocked: true, category: "ads", rule: "StevenBlack", response_time_ms: 1 },
    kotlin: `suspend fun checkDomain(domain: String): Boolean {
    val resp = api.dnsQuery(
        DnsQueryRequest(domain = domain, device_id = prefs.getDeviceId()),
        auth = "Bearer \${prefs.getToken()}"
    )
    return resp.blocked
}

// In your VpnService DNS interceptor:
override fun resolve(query: DnsQuery): DnsResponse {
    val blocked = runBlocking { checkDomain(query.name) }
    return if (blocked) DnsResponse.nxDomain() else upstream.resolve(query)
}`,
  },
  {
    method: "POST",
    path: "/v1/dns/batch",
    summary: "Check up to 100 domains in a single request",
    auth: true,
    request: {
      domains: ["ads.doubleclick.net", "github.com", "tracking.evil.com"],
      device_id: "42",
    },
    response: {
      results: {
        "ads.doubleclick.net": true,
        "github.com": false,
        "tracking.evil.com": true,
      },
    },
    kotlin: `suspend fun checkBatch(domains: List<String>): Map<String, Boolean> {
    val resp = api.dnsBatch(
        DnsBatchRequest(domains = domains, device_id = prefs.getDeviceId()),
        auth = "Bearer \${prefs.getToken()}"
    )
    return resp.results
}`,
  },
  {
    method: "POST",
    path: "/v1/android/heartbeat",
    summary: "Ping server every 5 minutes — updates last_seen, returns sync flags",
    auth: true,
    request: { device_id: "42", vpn_active: true },
    response: { blocklist_updated: false, force_sync: false, vpn_active: true, server_time: "2026-05-03T05:00:00Z" },
    kotlin: `// Call every 5 minutes from a WorkManager periodic task
suspend fun sendHeartbeat() {
    val resp = api.heartbeat(
        HeartbeatRequest(
            device_id = prefs.getDeviceId(),
            vpn_active = VpnManager.isActive()
        ),
        auth = "Bearer \${prefs.getToken()}"
    )
    if (resp.force_sync) syncBlocklist(prefs.getBlocklistEtag())
}`,
  },
  {
    method: "POST",
    path: "/v1/android/stats",
    summary: "Push hourly aggregated stats — merged into dashboard",
    auth: true,
    request: {
      device_id: "42",
      period_start: "2026-05-03T04:00:00Z",
      period_end: "2026-05-03T05:00:00Z",
      total_queries: 4521,
      blocked_count: 892,
      top_blocked_domains: [{ domain: "doubleclick.net", count: 45 }],
      battery_impact_percent: 1.2,
      data_saved_kb: 2400,
    },
    response: { ok: true, recorded: 892, battery_impact_percent: 1.2, data_saved_kb: 2400 },
    kotlin: `// Schedule every 1 hour with WorkManager
suspend fun pushStats(stats: HourlyStats) {
    api.pushStats(
        StatsRequest(
            device_id = prefs.getDeviceId(),
            period_start = stats.start.toIsoString(),
            period_end = stats.end.toIsoString(),
            total_queries = stats.totalQueries,
            blocked_count = stats.blockedCount,
            top_blocked_domains = stats.topBlocked,
            battery_impact_percent = stats.batteryImpact,
            data_saved_kb = stats.dataSavedKb
        ),
        auth = "Bearer \${prefs.getToken()}"
    )
}`,
  },
  {
    method: "GET",
    path: "/v1/dns/allow",
    summary: "Get the user's allowlist (domains that are never blocked)",
    auth: true,
    response: {
      allowlist: [{ id: 1, domain: "mycompany.com", addedAt: "2026-05-03T05:00:00Z" }],
    },
  },
  {
    method: "POST",
    path: "/v1/dns/allow",
    summary: "Add a domain to the allowlist",
    auth: true,
    request: { domain: "mycompany.com" },
    response: { id: 1, domain: "mycompany.com", addedAt: "2026-05-03T05:00:00Z" },
  },
  {
    method: "DELETE",
    path: "/v1/dns/allow/{domain}",
    summary: "Remove a domain from the allowlist",
    auth: true,
    response: { message: "mycompany.com removed from allowlist" },
  },
];

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"response" | "kotlin">("response");
  const serverUrl = `https://${window.location.hostname}/api`;
  const fullPath = `${serverUrl}${ep.path}`;

  return (
    <Card className="bg-card border-border">
      <button
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-3">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            <MethodBadge method={ep.method} />
            <span className="font-mono text-sm text-foreground flex-1 text-left">{ep.path}</span>
            {ep.auth && (
              <Badge variant="outline" className="text-xs border-amber-400/30 text-amber-400 font-mono">
                Bearer
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground ml-7">{ep.summary}</p>
        </CardHeader>
      </button>

      {open && (
        <CardContent className="pt-0 px-4 pb-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Full URL</span>
              <CopyButton value={fullPath} />
            </div>
            <div className="font-mono text-xs text-primary bg-black/30 px-3 py-2 rounded border border-border break-all">
              {ep.method} {fullPath}
            </div>
          </div>

          {ep.auth && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Auth Header</span>
              <div className="font-mono text-xs text-amber-400 bg-black/30 px-3 py-2 rounded border border-border mt-1">
                Authorization: Bearer {"<access_token>"}
              </div>
            </div>
          )}

          {ep.request && typeof ep.request === "object" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Request Body</span>
                <CopyButton value={JSON.stringify(ep.request, null, 2)} />
              </div>
              <pre className="font-mono text-xs text-green-400/80 bg-black/30 px-3 py-2 rounded border border-border overflow-x-auto">
                {JSON.stringify(ep.request, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              {ep.kotlin && (
                <>
                  <button
                    className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "response" ? "text-primary bg-primary/10 border border-primary/30" : "text-muted-foreground"}`}
                    onClick={() => setTab("response")}
                  >
                    Response
                  </button>
                  <button
                    className={`text-xs font-mono px-2 py-0.5 rounded flex items-center gap-1 ${tab === "kotlin" ? "text-primary bg-primary/10 border border-primary/30" : "text-muted-foreground"}`}
                    onClick={() => setTab("kotlin")}
                  >
                    <Code2 className="w-3 h-3" /> Kotlin
                  </button>
                </>
              )}
              {!ep.kotlin && <span className="text-xs text-muted-foreground uppercase tracking-wider">Response</span>}
              <CopyButton value={tab === "kotlin" && ep.kotlin ? ep.kotlin : (typeof ep.response === "string" ? ep.response : JSON.stringify(ep.response, null, 2))} />
            </div>

            {tab === "response" ? (
              <pre className="font-mono text-xs text-cyan-300/80 bg-black/30 px-3 py-2 rounded border border-border overflow-x-auto">
                {typeof ep.response === "string" ? ep.response : JSON.stringify(ep.response, null, 2)}
              </pre>
            ) : (
              <pre className="font-mono text-xs text-purple-300/80 bg-black/30 px-3 py-2 rounded border border-border overflow-x-auto">
                {ep.kotlin}
              </pre>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ApiDocs() {
  const serverUrl = `https://${window.location.hostname}/api`;

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Code2 className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">API_DOCS</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Android API reference — all endpoints with request/response examples and Kotlin snippets.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
            v1.0
          </Badge>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Base URL</div>
                <div className="font-mono text-xs text-primary break-all">{serverUrl}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Auth</div>
                <div className="font-mono text-xs text-amber-400">Bearer token (30-day JWT)</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Endpoints</div>
                <div className="font-mono text-xs text-primary">{endpoints.length} documented</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Format</div>
                <div className="font-mono text-xs text-primary">application/json</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold font-mono text-foreground uppercase tracking-wider">Android Endpoints</h2>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="space-y-2">
          {endpoints.map((ep) => (
            <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
          ))}
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-mono text-primary font-bold mb-2">SYNC SCHEDULE</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
              <div><span className="text-primary/70">blocklist  </span>every 24h (ETag cached)</div>
              <div><span className="text-primary/70">stats push </span>every 1h</div>
              <div><span className="text-primary/70">heartbeat  </span>every 5 min</div>
              <div><span className="text-primary/70">token      </span>re-login every 29d</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
