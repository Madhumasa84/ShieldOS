import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useListCustomBlocklist, useAddCustomDomain, useRemoveCustomDomain, useGetBlocklistStats, getListCustomBlocklistQueryKey, getGetBlocklistStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Plus, Trash2, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function Blocklist() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<string>("ads");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useGetBlocklistStats({ query: { queryKey: getGetBlocklistStatsQueryKey() } });
  
  const { data: listData, isLoading } = useListCustomBlocklist(
    { search: search || undefined, category: category !== "all" ? (category as any) : undefined },
    { query: { queryKey: getListCustomBlocklistQueryKey({ search: search || undefined, category: category !== "all" ? (category as any) : undefined }) } }
  );

  const addMutation = useAddCustomDomain();
  const removeMutation = useRemoveCustomDomain();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;

    addMutation.mutate({ data: { domain: newDomain, category: newCategory as any } }, {
      onSuccess: () => {
        toast({ title: "Domain Added", description: `${newDomain} added to blocklist.` });
        setNewDomain("");
        queryClient.invalidateQueries({ queryKey: getListCustomBlocklistQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleRemove = (domain: string) => {
    removeMutation.mutate({ domain }, {
      onSuccess: () => {
        toast({ title: "Domain Removed", description: `${domain} removed from blocklist.` });
        queryClient.invalidateQueries({ queryKey: getListCustomBlocklistQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBlocklistStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">Blocklist Registry</h1>
          <p className="text-muted-foreground">Manage custom interception rules and review blocklist statistics.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-primary/20 bg-card/40">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase mb-1">Total Entries</div>
              <div className="text-2xl font-bold text-primary">{stats?.total?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>
          {stats?.byCategory.map(c => (
            <Card key={c.category} className="border-border bg-card/40">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground uppercase mb-1">{c.category}</div>
                <div className="text-xl font-bold">{c.count.toLocaleString()}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Form */}
          <Card className="col-span-1 border-border bg-card/50 h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Add Custom Rule
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                <Button type="submit" className="w-full uppercase font-bold tracking-wider" disabled={addMutation.isPending || !newDomain}>
                  <Plus className="w-4 h-4 mr-2" />
                  Inject Rule
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* List */}
          <Card className="col-span-1 lg:col-span-2 border-border bg-card/50">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
              <CardTitle className="text-lg">Registry Database</CardTitle>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search domains..." 
                    className="pl-9 bg-background h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-32 h-9 bg-background">
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
            <CardContent>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Domain</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">Added</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background/50">
                    {isLoading ? (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground py-8">Scanning registry...</td></tr>
                    ) : listData?.entries.length === 0 ? (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground py-8">No records found matching criteria.</td></tr>
                    ) : (
                      listData?.entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/20 transition-colors group">
                          <td className="px-4 py-3 font-mono font-medium text-foreground">{entry.domain}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`
                              ${entry.category === 'malware' ? 'border-destructive text-destructive' : ''}
                              ${entry.category === 'tracking' ? 'border-primary text-primary' : ''}
                            `}>
                              {entry.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {format(new Date(entry.addedAt), 'yyyy-MM-dd HH:mm')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {entry.source === 'custom' ? (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => handleRemove(entry.domain)}
                                disabled={removeMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <TooltipProvider>
                                <AlertTriangle className="w-4 h-4 text-muted-foreground/50 inline-block" />
                              </TooltipProvider>
                            )}
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
      </div>
    </AppShell>
  );
}
