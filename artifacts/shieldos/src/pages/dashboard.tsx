import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  useGetStatsDashboard,
  getGetStatsDashboardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldAlert,
  MonitorSmartphone,
  Globe,
  Activity,
  ShieldBan,
  TrendingUp,
  Clock,
  Wifi,
  FileDown,
  Loader2,
} from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

const COLORS = ["#00E5FF", "#00FF87", "#FFD166", "#FF4D4D", "#A066FF", "#FFFFFF"];

const CATEGORY_COLORS: Record<string, string> = {
  ads: "#FFD166",
  tracking: "#00E5FF",
  malware: "#FF4D4D",
  social: "#A066FF",
  unknown: "#888888",
};

// Animated counter: smoothly transitions between numbers
function AnimatedNumber({
  value,
  loading,
  className = "",
}: {
  value: number | undefined;
  loading: boolean;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(value ?? 0);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === undefined) return undefined;
    if (prevRef.current !== value) {
      setFlash(true);
      const timeout = setTimeout(() => setFlash(false), 600);
      prevRef.current = value;
      setDisplayed(value);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [value]);

  if (loading && displayed === 0) {
    return <Skeleton className="h-9 w-24 bg-primary/10" />;
  }

  return (
    <span
      className={`${className} transition-all duration-300 ${flash ? "scale-110 opacity-100" : ""}`}
      style={{ display: "inline-block", transformOrigin: "left center" }}
    >
      {displayed.toLocaleString()}
    </span>
  );
}

export default function Dashboard() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/v1/export/report/pdf", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `ShieldOS-Report-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  const { data: stats, isLoading } = useGetStatsDashboard({
    query: {
      queryKey: getGetStatsDashboardQueryKey(),
      refetchInterval: 30_000,
      onSuccess: () => setLastUpdated(new Date()),
    } as any,
  });

  // Tick "last updated X sec ago" every second
  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Set initial lastUpdated when first data arrives
  useEffect(() => {
    if (stats && !lastUpdated) setLastUpdated(new Date());
  }, [stats]);

  const chartData = stats?.blocked_by_hour ?? [];
  const categoryData = (stats?.blocked_by_category ?? []).map((c, i) => ({
    ...c,
    fill: CATEGORY_COLORS[c.category] ?? COLORS[i % COLORS.length],
  }));
  const topDomains = stats?.top_blocked_domains ?? [];

  const formatSecondsAgo = (s: number) => {
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    return formatDistanceToNow(lastUpdated!, { addSuffix: true });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">
              Command Overview
            </h1>
            <p className="text-muted-foreground">
              Network telemetry and interception statistics.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10 font-mono uppercase text-xs tracking-wider"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {exportingPdf ? "Generating..." : "Export Report"}
            </Button>
            {lastUpdated && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono bg-muted/30 border border-border rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {formatSecondsAgo(secondsAgo)}</span>
                <span className="text-border">·</span>
                <span className="text-primary/60">auto-refreshes every 30s</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            title="Blocked Today"
            value={stats?.trackers_blocked_today}
            icon={ShieldBan}
            loading={isLoading}
            accent="primary"
            span={2}
          />
          <StatCard
            title="Blocked All Time"
            value={stats?.trackers_blocked_total}
            icon={Shield}
            loading={isLoading}
            span={2}
          />
          <StatCard
            title="Domains Blacklisted"
            value={stats?.domains_in_blocklist}
            icon={Globe}
            loading={isLoading}
            span={2}
          />
          <StatCard
            title="Active Devices"
            value={stats?.active_devices}
            icon={MonitorSmartphone}
            loading={isLoading}
            badge={
              stats && stats.online_devices > 0 ? (
                <span className="flex items-center gap-1 text-xs font-mono text-green-400">
                  <Wifi className="w-3 h-3" />
                  {stats.online_devices} online
                </span>
              ) : undefined
            }
            span={2}
          />
          <StatCard
            title="Threats Neutralized"
            value={stats?.threats_detected}
            icon={ShieldAlert}
            loading={isLoading}
            accent="destructive"
            span={2}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Hourly bar chart */}
          <Card className="col-span-1 lg:col-span-2 border-primary/20 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Interceptions — Last 24h
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && chartData.length === 0 ? (
                <Skeleton className="h-[260px] w-full bg-primary/5" />
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <XAxis
                        dataKey="hour"
                        stroke="#555"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v.split(":")[0] + "h"}
                        interval={2}
                      />
                      <YAxis
                        stroke="#555"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(0,229,255,0.08)" }}
                        contentStyle={{
                          backgroundColor: "#12121f",
                          borderColor: "#00E5FF",
                          color: "#00E5FF",
                          borderRadius: "6px",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "12px",
                        }}
                        itemStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="count" fill="#00E5FF" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category pie */}
          <Card className="col-span-1 border-primary/20 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && categoryData.length === 0 ? (
                <Skeleton className="h-[260px] w-full bg-primary/5" />
              ) : categoryData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                  No data yet
                </div>
              ) : (
                <div className="h-[260px] w-full flex flex-col">
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="count"
                          nameKey="category"
                        >
                          {categoryData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#12121f",
                            borderColor: "#333",
                            borderRadius: "6px",
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {categoryData.map((entry) => (
                      <div key={entry.category} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: entry.fill }}
                          />
                          <span className="text-muted-foreground capitalize">{entry.category}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-muted-foreground">{entry.count.toLocaleString()}</span>
                          <span className="font-bold w-10 text-right">{entry.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom row: top domains + today's stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 10 blocked domains */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                Top Blocked Domains
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && topDomains.length === 0 ? (
                <div className="px-6 pb-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full bg-primary/5" />
                  ))}
                </div>
              ) : topDomains.length === 0 ? (
                <div className="px-6 pb-6 pt-2 text-muted-foreground text-sm">
                  No blocked requests logged yet.
                </div>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border/40">
                      {topDomains.map((d, i) => {
                        const maxCount = topDomains[0]?.count ?? 1;
                        const pct = (d.count / maxCount) * 100;
                        return (
                          <tr key={d.domain} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2.5 w-8 text-center text-xs text-muted-foreground font-mono">
                              {i + 1}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="relative">
                                <div
                                  className="absolute left-0 top-0 bottom-0 bg-primary/8 rounded"
                                  style={{ width: `${pct}%` }}
                                />
                                <span className="relative font-mono text-xs text-foreground">
                                  {d.domain}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-primary whitespace-nowrap">
                              {d.count.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's summary card */}
          <Card className="border-destructive/20 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-destructive flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Session Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    Blocked Today
                  </div>
                  <div className="text-3xl font-bold font-mono text-primary">
                    <AnimatedNumber value={stats?.trackers_blocked_today} loading={isLoading} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    All-Time Intercepts
                  </div>
                  <div className="text-3xl font-bold font-mono">
                    <AnimatedNumber value={stats?.trackers_blocked_total} loading={isLoading} />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Domains in blocklist</span>
                  <span className="font-mono font-bold">
                    {isLoading ? "…" : (stats?.domains_in_blocklist ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Verified threats</span>
                  <span className="font-mono font-bold text-destructive">
                    {isLoading ? "…" : (stats?.threats_detected ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Devices online now</span>
                  <span className="flex items-center gap-2 font-mono font-bold">
                    {stats && stats.online_devices > 0 && (
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    )}
                    {isLoading ? "…" : (stats?.online_devices ?? 0)}
                    <span className="text-muted-foreground font-normal">
                      / {stats?.active_devices ?? 0}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Top blocked domain</span>
                  <code className="text-xs bg-muted/40 border border-border px-2 py-0.5 rounded font-mono truncate max-w-[180px]">
                    {isLoading ? "…" : (topDomains[0]?.domain ?? "none")}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  accent = "default",
  badge,
  span = 1,
}: {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
  accent?: "primary" | "destructive" | "default";
  badge?: React.ReactNode;
  span?: number;
}) {
  const isPrimary = accent === "primary";
  const isDestructive = accent === "destructive";

  return (
    <Card
      className={`col-span-1 ${span === 2 ? "sm:col-span-1 xl:col-span-2" : ""} border-${
        isPrimary ? "primary/40" : isDestructive ? "destructive/40" : "border"
      } bg-card/40 overflow-hidden relative group`}
    >
      {isPrimary && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_var(--primary)]" />
      )}
      {isDestructive && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-destructive shadow-[0_0_8px_var(--destructive)]" />
      )}
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              {title}
            </p>
            <p
              className={`text-3xl font-bold tracking-tight font-mono ${
                isPrimary
                  ? "text-primary"
                  : isDestructive
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              <AnimatedNumber value={value} loading={loading} />
            </p>
            {badge && <div className="mt-1">{badge}</div>}
          </div>
          <div
            className={`p-2.5 rounded-xl border shrink-0 ml-2 ${
              isPrimary
                ? "bg-primary/10 border-primary/20 text-primary"
                : isDestructive
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
