import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { BarChart2, Download, FileText, FileJson, FileSpreadsheet, Loader2, AlertTriangle, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

// ── API fetch ─────────────────────────────────────────────────────────────────
async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Range config ──────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "24h", value: "1d" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
];

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  ads: "#8b5cf6",
  tracking: "#f59e0b",
  malware: "#ef4444",
  phishing: "#f97316",
  spyware: "#ec4899",
  social: "#06b6d4",
  ransomware: "#dc2626",
  adware: "#a78bfa",
  unknown: "#6b7280",
};
const CHART_COLORS = ["#00bcd4", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#06b6d4", "#ec4899"];
const getCatColor = (cat: string) => CAT_COLORS[cat] ?? "#6b7280";

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtBucket(bucket: string, granularity: string) {
  try {
    const d = new Date(bucket);
    return granularity === "hour" ? format(d, "HH:mm") : format(d, "MMM d");
  } catch { return bucket; }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-foreground" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardContent className="pt-4 pb-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/30">
      <BarChart2 className="w-10 h-10 mb-2" />
      <p className="text-xs font-mono">No {label} data for this range</p>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md p-2.5 text-xs shadow-xl">
      {label && <p className="font-mono text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground font-mono">{typeof p.value === "number" ? fmtNum(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Analytics() {
  const [range, setRange] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const rangeParams = showCustom && customFrom && customTo
    ? `from=${customFrom}&to=${customTo}`
    : `range=${range}`;

  const useAnalytics = (path: string) =>
    useQuery({
      queryKey: ["analytics", path, rangeParams],
      queryFn: () => apiFetch(`/api/v1/analytics/${path}?${rangeParams}`),
      staleTime: 60_000,
    });

  const overview = useAnalytics("overview");
  const blockedTime = useAnalytics("blocked-over-time");
  const topDomains = useAnalytics("top-domains?limit=20&" + rangeParams.replace("?", ""));
  const byCategory = useAnalytics("by-category");
  const byDevice = useAnalytics("by-device");
  const threats = useAnalytics("threats");

  // Fix: topDomains queryKey + url would be double-prefixed, let's build it directly:
  const topDomainsQuery = useQuery({
    queryKey: ["analytics", "top-domains", rangeParams],
    queryFn: () => apiFetch(`/api/v1/analytics/top-domains?limit=20&${rangeParams}`),
    staleTime: 60_000,
  });

  const downloadReport = async (fmt: string) => {
    setExportLoading(fmt);
    try {
      const a = document.createElement("a");
      a.href = `/api/v1/reports/generate?format=${fmt}&${rangeParams}`;
      a.download = `shieldos-report-${range || "custom"}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setExportLoading(null), 2000);
    }
  };

  const ov = overview.data;
  const timeData = (blockedTime.data?.data ?? []).map((d: any) => ({
    ...d,
    label: fmtBucket(d.bucket, blockedTime.data?.granularity ?? "day"),
  }));
  const domainData: any[] = topDomainsQuery.data?.domains ?? [];
  const categoryData: any[] = byCategory.data?.categories ?? [];
  const deviceData: any[] = byDevice.data?.devices ?? [];
  const threatData: any[] = (threats.data?.threats ?? []).map((t: any) => ({
    ...t,
    x: new Date(t.reportedAt).getTime(),
    y: t.votes + 1,
    size: t.verified ? 60 : 30,
  }));

  // Avg block rate for reference line
  const avgRate = timeData.length > 0
    ? Math.round((timeData.reduce((s: number, d: any) => s + d.blockRate, 0) / timeData.length) * 10) / 10
    : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <BarChart2 className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">ANALYTICS</h1>
            </div>
            <p className="text-sm text-muted-foreground">Privacy intelligence, trends, and behavioral analysis.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Range selector */}
            <div className="flex gap-1 p-1 bg-muted/30 rounded-lg border border-border/60">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setRange(p.value); setShowCustom(false); }}
                  className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                    !showCustom && range === p.value
                      ? "bg-primary text-black font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustom((s) => !s)}
                className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                  showCustom ? "bg-primary text-black font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom
              </button>
            </div>

            {/* Export buttons */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => downloadReport("csv")}
              disabled={exportLoading === "csv"}
            >
              {exportLoading === "csv" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => downloadReport("json")}
              disabled={exportLoading === "json"}
            >
              {exportLoading === "json" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3" />}
              JSON
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-black hover:bg-primary/90"
              onClick={() => downloadReport("pdf")}
              disabled={exportLoading === "pdf"}
            >
              {exportLoading === "pdf" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              Export PDF
            </Button>
          </div>
        </div>

        {/* Custom date range */}
        {showCustom && (
          <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border/60 rounded-lg">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs w-40 bg-background font-mono" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs w-40 bg-background font-mono" />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Queries" value={overview.isLoading ? "—" : fmtNum(ov?.totalRequests ?? 0)} />
          <StatCard label="Blocked" value={overview.isLoading ? "—" : fmtNum(ov?.blocked ?? 0)} color="text-red-400" />
          <StatCard label="Allowed" value={overview.isLoading ? "—" : fmtNum(ov?.allowed ?? 0)} color="text-emerald-400" />
          <StatCard label="Block Rate" value={overview.isLoading ? "—" : `${ov?.blockRate ?? 0}%`} color={ov?.blockRate > 50 ? "text-orange-400" : "text-primary"} />
          <StatCard label="Threats" value={overview.isLoading ? "—" : fmtNum(ov?.threats ?? 0)} color="text-orange-400" />
          <StatCard label="Devices" value={overview.isLoading ? "—" : (ov?.deviceCount ?? 0)} />
        </div>

        {/* Chart A: Blocked Over Time (Line) */}
        <Card className="bg-card/60 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">BLOCKED REQUESTS OVER TIME</CardTitle>
            <p className="text-xs text-muted-foreground">Total queries vs blocked — line chart</p>
          </CardHeader>
          <CardContent>
            {blockedTime.isLoading ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : timeData.length === 0 ? (
              <EmptyChart label="time series" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
                  <Line type="monotone" dataKey="blocked" stroke="#ef4444" strokeWidth={2} dot={false} name="Blocked" />
                  <Line type="monotone" dataKey="allowed" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Allowed" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart B: Block Rate Trend (Area) */}
        <Card className="bg-card/60 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">BLOCK RATE TREND</CardTitle>
            <p className="text-xs text-muted-foreground">% of queries blocked over time — area chart with average</p>
          </CardHeader>
          <CardContent>
            {blockedTime.isLoading ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : timeData.length === 0 ? (
              <EmptyChart label="block rate" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00bcd4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00bcd4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={avgRate} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `avg ${avgRate}%`, fill: "#f59e0b", fontSize: 10 }} />
                  <Area type="monotone" dataKey="blockRate" stroke="#00bcd4" strokeWidth={2} fill="url(#rateGrad)" name="Block Rate %" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart C: Top Blocked Domains (Horizontal Bar) */}
        <Card className="bg-card/60 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">TOP 20 BLOCKED DOMAINS</CardTitle>
            <p className="text-xs text-muted-foreground">Horizontal bar — most frequently blocked</p>
          </CardHeader>
          <CardContent>
            {topDomainsQuery.isLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : domainData.length === 0 ? (
              <EmptyChart label="domains" />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, domainData.length * 26)}>
                <BarChart
                  layout="vertical"
                  data={domainData.slice(0, 20)}
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} />
                  <YAxis
                    type="category"
                    dataKey="domain"
                    tick={{ fill: "#9ca3af", fontSize: 10, fontFamily: "monospace" }}
                    tickLine={false}
                    width={180}
                    tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 24) + "…" : v}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Blocked" radius={[0, 3, 3, 0]}>
                    {domainData.slice(0, 20).map((d: any, i: number) => (
                      <Cell key={i} fill={getCatColor(d.category)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Row: Category Donut + Per-Device Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart D: Category Donut */}
          <Card className="bg-card/60 border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono">CATEGORY BREAKDOWN</CardTitle>
              <p className="text-xs text-muted-foreground">Donut chart by traffic category</p>
            </CardHeader>
            <CardContent>
              {byCategory.isLoading ? (
                <div className="h-56 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : categoryData.length === 0 ? (
                <EmptyChart label="category" />
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="count"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {categoryData.map((d: any, i: number) => (
                          <Cell key={i} fill={getCatColor(d.category)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [fmtNum(Number(v)), "Blocked"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {categoryData.map((d: any) => (
                      <div key={d.category} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: getCatColor(d.category) }} />
                        <span className="text-xs font-mono capitalize flex-1 text-foreground">{d.category}</span>
                        <span className="text-xs font-bold font-mono text-foreground">{fmtNum(d.count)}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {d.percent ?? Math.round((d.count / byCategory.data.total) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart E: Per-Device Grouped Bar */}
          <Card className="bg-card/60 border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono">PER-DEVICE COMPARISON</CardTitle>
              <p className="text-xs text-muted-foreground">Blocked vs allowed per device — grouped bar</p>
            </CardHeader>
            <CardContent>
              {byDevice.isLoading ? (
                <div className="h-56 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : deviceData.length === 0 ? (
                <EmptyChart label="device" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deviceData} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      tickLine={false}
                      angle={-15}
                      textAnchor="end"
                      tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "…" : v}
                    />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="blocked" name="Blocked" fill="#ef4444" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="allowed" name="Allowed" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart F: Threat Timeline (Scatter) */}
        <Card className="bg-card/60 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">THREAT TIMELINE</CardTitle>
            <p className="text-xs text-muted-foreground">Scatter plot — reported threats over time by category (dot size = vote count)</p>
          </CardHeader>
          <CardContent>
            {threats.isLoading ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : threatData.length === 0 ? (
              <EmptyChart label="threat" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={["auto", "auto"]}
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(v: number) => format(new Date(v), "MMM d")}
                    name="Date"
                  />
                  <YAxis dataKey="y" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} name="Votes" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border rounded-md p-2.5 text-xs shadow-xl">
                          <p className="font-bold font-mono text-foreground">{d.domain}</p>
                          <p className="text-muted-foreground capitalize">{d.category}</p>
                          <p className="text-muted-foreground">{format(new Date(d.reportedAt), "MMM d, yyyy HH:mm")}</p>
                          <p className="text-muted-foreground">Votes: {d.votes}{d.verified ? " · Verified" : ""}</p>
                        </div>
                      );
                    }}
                  />
                  {/* Group by category */}
                  {Object.entries(
                    threatData.reduce((acc: any, t: any) => {
                      if (!acc[t.category]) acc[t.category] = [];
                      acc[t.category].push(t);
                      return acc;
                    }, {})
                  ).map(([cat, points]: [string, any]) => (
                    <Scatter
                      key={cat}
                      name={cat}
                      data={points}
                      fill={getCatColor(cat)}
                      fillOpacity={0.8}
                    />
                  ))}
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
