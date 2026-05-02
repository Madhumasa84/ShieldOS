import { AppShell } from "@/components/layout/app-shell";
import { useGetDashboardSummary, useGetBlockedChart, useGetCategoryBreakdown, getGetDashboardSummaryQueryKey, getGetBlockedChartQueryKey, getGetCategoryBreakdownQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldAlert, MonitorSmartphone, Globe, Activity, ShieldBan } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: chartData, isLoading: loadingChart } = useGetBlockedChart({ query: { queryKey: getGetBlockedChartQueryKey() } });
  const { data: breakdownData, isLoading: loadingBreakdown } = useGetCategoryBreakdown({ query: { queryKey: getGetCategoryBreakdownQueryKey() } });

  const COLORS = ['#00E5FF', '#00FF87', '#FFD166', '#FF4D4D', '#A066FF', '#FFFFFF'];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">Command Overview</h1>
          <p className="text-muted-foreground">Network telemetry and interception statistics.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Intercepts"
            value={summary?.trackersBlockedTotal}
            icon={ShieldBan}
            loading={loadingSummary}
            accent="primary"
          />
          <StatCard
            title="Domains Blacklisted"
            value={summary?.domainsInBlocklist}
            icon={Globe}
            loading={loadingSummary}
          />
          <StatCard
            title="Active VPN Nodes"
            value={summary?.activeDevices}
            icon={MonitorSmartphone}
            loading={loadingSummary}
          />
          <StatCard
            title="Threats Neutralized"
            value={summary?.threatsDetected}
            icon={ShieldAlert}
            loading={loadingSummary}
            accent="destructive"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <Card className="col-span-1 lg:col-span-2 border-primary/20 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Interceptions (Last 24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingChart ? (
                <Skeleton className="h-[300px] w-full bg-primary/5" />
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData?.data || []}>
                      <XAxis 
                        dataKey="hour" 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => value.split(':')[0] + 'h'}
                      />
                      <YAxis
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}`}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(0, 229, 255, 0.1)' }}
                        contentStyle={{ backgroundColor: '#1A1A26', borderColor: '#00E5FF', color: '#00E5FF', borderRadius: '4px', fontFamily: 'JetBrains Mono' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="count" fill="#00E5FF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breakdown */}
          <Card className="col-span-1 border-primary/20 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">Category Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBreakdown ? (
                <Skeleton className="h-[300px] w-full bg-primary/5" />
              ) : (
                <div className="h-[300px] w-full flex flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={breakdownData?.data || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="category"
                      >
                        {(breakdownData?.data || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#1A1A26', borderColor: '#00E5FF', borderRadius: '4px', fontFamily: 'JetBrains Mono' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full mt-4 space-y-2">
                    {(breakdownData?.data || []).map((entry, index) => (
                      <div key={entry.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-muted-foreground capitalize">{entry.category}</span>
                        </div>
                        <span className="font-bold">{entry.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Target */}
        <Card className="border-destructive/20 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Primary Threat Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-1/3 bg-primary/5" />
            ) : (
              <div className="flex items-center justify-between">
                <code className="text-xl text-destructive font-bold bg-destructive/10 px-4 py-2 rounded border border-destructive/20">
                  {summary?.topBlockedDomain || 'N/A'}
                </code>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground uppercase">Last 24h Blocks</div>
                  <div className="text-2xl font-bold">{summary?.blockedLast24h.toLocaleString()}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value, icon: Icon, loading, accent = "default" }: any) {
  const isPrimary = accent === "primary";
  const isDestructive = accent === "destructive";
  
  return (
    <Card className={`border-${isPrimary ? 'primary/40' : isDestructive ? 'destructive/40' : 'border'} bg-card/40 overflow-hidden relative group`}>
      {isPrimary && <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_10px_var(--primary)]" />}
      {isDestructive && <div className="absolute top-0 left-0 w-full h-1 bg-destructive shadow-[0_0_10px_var(--destructive)]" />}
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 bg-primary/10" />
            ) : (
              <p className={`text-3xl font-bold tracking-tight ${isPrimary ? 'text-primary' : isDestructive ? 'text-destructive' : 'text-foreground'}`}>
                {value?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl border ${isPrimary ? 'bg-primary/10 border-primary/20 text-primary' : isDestructive ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-muted border-border text-muted-foreground'}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
