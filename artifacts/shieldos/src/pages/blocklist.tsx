import { useState, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  useListCustomBlocklist,
  useAddCustomDomain,
  useRemoveCustomDomain,
  useGetBlocklistStats,
  useListSystemBlocklist,
  useGetSyncStatus,
  useTriggerSync,
  getListCustomBlocklistQueryKey,
  getGetBlocklistStatsQueryKey,
  getGetSyncStatusQueryKey,
  getListSystemBlocklistQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Upload,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const CATEGORY_COLORS: Record<string, string> = {
  ads: "border-yellow-500/50 text-yellow-400",
  tracking: "border-primary/50 text-primary",
  malware: "border-destructive/50 text-destructive",
  social: "border-purple-500/50 text-purple-400",
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={`capitalize text-xs ${CATEGORY_COLORS[category] ?? "border-border text-muted-foreground"}`}>
      {category}
    </Badge>
  );
}

export default function Blocklist() {
  const [tab, setTab] = useState<"custom" | "system">("system");
  const [customSearch, setCustomSearch] = useState("");
  const [customCategory, setCustomCategory] = useState<string>("all");
  const [systemSearch, setSystemSearch] = useState("");
  const [systemCategory, setSystemCategory] = useState<string>("all");
  const [systemPage, setSystemPage] = useState(1);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<string>("ads");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const token = localStorage.getItem("shieldos_access_token");

  const { data: stats, refetch: refetchStats } = useGetBlocklistStats({
    query: { queryKey: getGetBlocklistStatsQueryKey() },
  });

  const { data: syncStatus, refetch: refetchSync } = useGetSyncStatus({
    query: {
      queryKey: getGetSyncStatusQueryKey(),
      refetchInterval: stats?.syncStatus === "running" ? 2000 : false,
    },
  });

  const { data: listData, isLoading: customLoading } = useListCustomBlocklist(
    {
      search: customSearch || undefined,
      category: customCategory !== "all" ? (customCategory as any) : undefined,
    },
    {
      query: {
        queryKey: getListCustomBlocklistQueryKey({
          search: customSearch || undefined,
          category: customCategory !== "all" ? (customCategory as any) : undefined,
        }),
      },
    }
  );

  const systemParams = {
    search: systemSearch || undefined,
    category: systemCategory !== "all" ? systemCategory : undefined,
    page: systemPage,
    limit: 50,
  };
  const { data: systemData, isLoading: systemLoading } = useListSystemBlocklist(
    systemParams,
    { query: { queryKey: getListSystemBlocklistQueryKey(systemParams) } }
  );

  const addMutation = useAddCustomDomain();
  const removeMutation = useRemoveCustomDomain();
  const syncMutation = useTriggerSync();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    addMutation.mutate(
      { data: { domain: newDomain, category: newCategory as any } },
      {
        onSuccess: () => {
          toast({ title: "Rule Injected", description: `${newDomain} added to blocklist.` });
          setNewDomain("");
          queryClient.invalidateQueries({ queryKey: getListCustomBlocklistQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleRemove = (domain: string) => {
    removeMutation.mutate(
      { domain },
      {
        onSuccess: () => {
          toast({ title: "Rule Removed", description: `${domain} removed.` });
          queryClient.invalidateQueries({ queryKey: getListCustomBlocklistQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
        },
      }
    );
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Sync Initiated", description: "Fetching latest blocklists..." });
        setTimeout(() => {
          refetchSync();
          refetchStats();
          queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
        }, 1000);
      },
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    toast({ title: "Importing...", description: `Processing ${file.name}` });

    try {
      const res = await fetch("/api/v1/blocklist/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Import failed");
      toast({
        title: "Import Complete",
        description: `${data.added.toLocaleString()} domains added, ${data.skipped.toLocaleString()} skipped.`,
      });
      queryClient.invalidateQueries({ queryKey: getListCustomBlocklistQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isRunning = syncStatus?.status === "running" || stats?.syncStatus === "running";
  const totalDomains = (stats?.total ?? 0) + (stats?.systemTotal ?? 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">
              Blocklist Registry
            </h1>
            <p className="text-muted-foreground">
              System-wide threat domains + custom interception rules.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="file"
              accept=".txt"
              ref={fileInputRef}
              onChange={handleFileImport}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Import .txt
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleSync}
              disabled={isRunning || syncMutation.isPending}
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isRunning ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </div>

        {/* Sync Status Banner */}
        <Card
          className={`border-l-4 ${
            isRunning
              ? "border-l-yellow-500 bg-yellow-500/5 border-yellow-500/20"
              : syncStatus?.status === "completed"
              ? "border-l-green-500 bg-green-500/5 border-green-500/20"
              : syncStatus?.status === "failed"
              ? "border-l-destructive bg-destructive/5 border-destructive/20"
              : "border-l-border bg-card/30 border-border"
          }`}
        >
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isRunning ? (
                <Loader2 className="w-5 h-5 text-yellow-400 animate-spin shrink-0" />
              ) : syncStatus?.status === "completed" ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              ) : syncStatus?.status === "failed" ? (
                <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              ) : (
                <Database className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div>
                <div className="font-mono text-sm font-semibold">
                  {isRunning
                    ? "Sync in progress — fetching blocklists..."
                    : syncStatus?.status === "completed"
                    ? `Sync complete — ${syncStatus.totalDomains.toLocaleString()} system domains loaded`
                    : syncStatus?.status === "failed"
                    ? `Sync failed: ${syncStatus.error ?? "unknown error"}`
                    : "No sync yet"}
                </div>
                {syncStatus?.completedAt && !isRunning && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last sync:{" "}
                    {formatDistanceToNow(new Date(syncStatus.completedAt), { addSuffix: true })}
                    {" · "}
                    {format(new Date(syncStatus.completedAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6 shrink-0 text-sm font-mono">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{totalDomains.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground uppercase">Total Domains</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{stats?.systemTotal?.toLocaleString() ?? 0}</div>
                <div className="text-xs text-muted-foreground uppercase">System</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{stats?.total?.toLocaleString() ?? 0}</div>
                <div className="text-xs text-muted-foreground uppercase">Custom</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab bar */}
        <div className="flex border-b border-border gap-0">
          {(["system", "custom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-mono font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "system" ? (
                <>
                  <Globe className="w-3.5 h-3.5 inline mr-2" />
                  System ({stats?.systemTotal?.toLocaleString() ?? "…"})
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 inline mr-2" />
                  Custom ({stats?.total?.toLocaleString() ?? "…"})
                </>
              )}
            </button>
          ))}
        </div>

        {tab === "system" && (
          <div className="space-y-4">
            {/* Category breakdown */}
            {stats?.systemByCategory && stats.systemByCategory.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.systemByCategory
                  .sort((a, b) => b.count - a.count)
                  .map((c) => (
                    <Card
                      key={c.category}
                      className={`bg-card/40 cursor-pointer border transition-colors ${
                        systemCategory === c.category ? "border-primary/50" : "border-border hover:border-border/80"
                      }`}
                      onClick={() =>
                        setSystemCategory(systemCategory === c.category ? "all" : c.category)
                      }
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider">
                            {c.category}
                          </div>
                          <CategoryBadge category={c.category} />
                        </div>
                        <div className="text-xl font-bold font-mono">{c.count.toLocaleString()}</div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}

            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex-1">
                  System Blocklist — {systemData?.total?.toLocaleString() ?? "…"} entries
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search domains..."
                      className="pl-8 h-8 text-xs bg-background font-mono"
                      value={systemSearch}
                      onChange={(e) => { setSystemSearch(e.target.value); setSystemPage(1); }}
                    />
                  </div>
                  <Select
                    value={systemCategory}
                    onValueChange={(v) => { setSystemCategory(v); setSystemPage(1); }}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="ads">Ads</SelectItem>
                      <SelectItem value="tracking">Tracking</SelectItem>
                      <SelectItem value="malware">Malware</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-y border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                          Domain
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs w-24">
                          Category
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs w-28">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {systemLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={3} className="px-4 py-3">
                              <div className="h-4 bg-muted/30 rounded animate-pulse w-3/4" />
                            </td>
                          </tr>
                        ))
                      ) : systemData?.entries.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">
                            {isRunning
                              ? "Sync in progress — check back shortly."
                              : "No domains match the current filter."}
                          </td>
                        </tr>
                      ) : (
                        systemData?.entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-sm text-foreground">
                              {entry.domain}
                            </td>
                            <td className="px-4 py-2.5">
                              <CategoryBadge category={entry.category} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                              {entry.source}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {systemData && systemData.total > systemData.limit && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <span className="text-xs text-muted-foreground font-mono">
                      Page {systemPage} of {Math.ceil(systemData.total / systemData.limit)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSystemPage((p) => Math.max(1, p - 1))}
                        disabled={systemPage === 1}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSystemPage((p) => p + 1)}
                        disabled={systemPage >= Math.ceil(systemData.total / systemData.limit)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "custom" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add Form */}
            <Card className="col-span-1 border-border bg-card/50 h-fit">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Add Custom Rule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-muted-foreground">Domain Target</label>
                    <Input
                      placeholder="e.g. trackers.example.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="font-mono bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-muted-foreground">Classification</label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ads">Ads</SelectItem>
                        <SelectItem value="tracking">Tracking</SelectItem>
                        <SelectItem value="malware">Malware</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    className="w-full uppercase font-bold tracking-wider"
                    disabled={addMutation.isPending || !newDomain}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Inject Rule
                  </Button>
                </form>

                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Bulk import from a hosts-format .txt file:
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-border"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Import .txt file
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Custom List */}
            <Card className="col-span-1 lg:col-span-2 border-border bg-card/50">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                  Custom Rules — {listData?.total?.toLocaleString() ?? "…"} entries
                </CardTitle>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-52">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-8 bg-background h-8 text-xs"
                      value={customSearch}
                      onChange={(e) => setCustomSearch(e.target.value)}
                    />
                  </div>
                  <Select value={customCategory} onValueChange={setCustomCategory}>
                    <SelectTrigger className="w-28 h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="ads">Ads</SelectItem>
                      <SelectItem value="tracking">Tracking</SelectItem>
                      <SelectItem value="malware">Malware</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-y border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                          Domain
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs w-24">
                          Category
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs w-32">
                          Added
                        </th>
                        <th className="px-4 py-2.5 w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {customLoading ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground py-8">
                            Scanning registry...
                          </td>
                        </tr>
                      ) : listData?.entries.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground py-10">
                            No custom rules. Add your first rule above.
                          </td>
                        </tr>
                      ) : (
                        listData?.entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-muted/10 transition-colors group">
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground">
                              {entry.domain}
                            </td>
                            <td className="px-4 py-2.5">
                              <CategoryBadge category={entry.category} />
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                              {format(new Date(entry.addedAt), "yyyy-MM-dd")}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => handleRemove(entry.domain)}
                                disabled={removeMutation.isPending}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
