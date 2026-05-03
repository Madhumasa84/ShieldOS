import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useGetThreatFeed, useGetThreatStats, useReportThreat, useVoteThreat, getGetThreatFeedQueryKey, getGetThreatStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ThumbsUp, ThumbsDown, CheckCircle2, AlertOctagon, Send, Activity, Skull, Flame, Eye, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

function getSeverity(category: string): { label: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; score: number; style: string; icon: React.ReactNode } {
  switch (category) {
    case "ransomware": return { label: "CRITICAL", score: 98, style: "text-red-500 bg-red-500/10 border-red-500/40", icon: <Skull className="w-3 h-3" /> };
    case "malware":    return { label: "CRITICAL", score: 95, style: "text-red-500 bg-red-500/10 border-red-500/40", icon: <Skull className="w-3 h-3" /> };
    case "spyware":    return { label: "HIGH",     score: 82, style: "text-orange-400 bg-orange-400/10 border-orange-400/40", icon: <Eye className="w-3 h-3" /> };
    case "phishing":   return { label: "HIGH",     score: 78, style: "text-orange-400 bg-orange-400/10 border-orange-400/40", icon: <Flame className="w-3 h-3" /> };
    case "tracking":   return { label: "MEDIUM",   score: 55, style: "text-yellow-400 bg-yellow-400/10 border-yellow-400/40", icon: <TrendingUp className="w-3 h-3" /> };
    case "adware":     return { label: "LOW",       score: 25, style: "text-muted-foreground bg-muted/10 border-border", icon: null };
    default:           return { label: "LOW",       score: 20, style: "text-muted-foreground bg-muted/10 border-border", icon: null };
  }
}

export default function Threats() {
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState<string>("malware");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState("all");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats } = useGetThreatStats({ query: { queryKey: getGetThreatStatsQueryKey() } });
  
  const { data: feedData, isLoading } = useGetThreatFeed(
    { category: filter !== "all" ? filter : undefined },
    { query: { queryKey: getGetThreatFeedQueryKey({ category: filter !== "all" ? filter : undefined }) } }
  );

  const reportMutation = useReportThreat();
  const voteMutation = useVoteThreat();

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain || !description) return;

    reportMutation.mutate({ data: { domain, category: category as any, description } }, {
      onSuccess: () => {
        toast({ title: "Intelligence Submitted", description: `Threat report for ${domain} filed.` });
        setDomain("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: getGetThreatFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetThreatStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleVote = (id: number, voteVal: 1 | -1) => {
    voteMutation.mutate({ threatId: id, data: { vote: voteVal } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetThreatFeedQueryKey() });
      }
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">Threat Intelligence</h1>
          <p className="text-muted-foreground">Community-driven threat detection and analysis feed.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border bg-card/40">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Total Reports</div>
                <div className="text-3xl font-bold font-mono">{stats?.totalReports?.toLocaleString() || 0}</div>
              </div>
              <ShieldAlert className="w-8 h-8 text-muted-foreground/30" />
            </CardContent>
          </Card>
          <Card className="border-destructive/30 bg-card/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-destructive uppercase tracking-wider mb-1 font-bold">Verified Threats</div>
                <div className="text-3xl font-bold font-mono text-destructive">{stats?.verifiedThreats?.toLocaleString() || 0}</div>
              </div>
              <AlertOctagon className="w-8 h-8 text-destructive/50" />
            </CardContent>
          </Card>
          <Card className="border-border bg-card/40">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Pending Review</div>
                <div className="text-3xl font-bold font-mono text-primary">{stats?.pendingReview?.toLocaleString() || 0}</div>
              </div>
              <Activity className="w-8 h-8 text-primary/30" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submit Form */}
          <Card className="col-span-1 border-border bg-card/50 h-fit sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Submit Intelligence
              </CardTitle>
              <CardDescription>File a new threat report for review.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReport} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase text-muted-foreground">Target Domain</label>
                  <Input 
                    placeholder="malicious-site.com" 
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="font-mono bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase text-muted-foreground">Threat Vector</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="malware">Malware</SelectItem>
                      <SelectItem value="phishing">Phishing</SelectItem>
                      <SelectItem value="tracking">Advanced Tracking</SelectItem>
                      <SelectItem value="adware">Adware</SelectItem>
                      <SelectItem value="spyware">Spyware</SelectItem>
                      <SelectItem value="ransomware">Ransomware</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase text-muted-foreground">Analysis Notes</label>
                  <Textarea 
                    placeholder="Provide evidence or context..." 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] bg-background font-mono text-sm resize-none"
                  />
                </div>
                <Button type="submit" className="w-full uppercase font-bold tracking-wider" disabled={reportMutation.isPending || !domain || !description}>
                  Submit Report
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Feed */}
          <div className="col-span-1 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold uppercase tracking-wider">Live Intel Feed</h3>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-8 text-xs bg-background">
                  <SelectValue placeholder="Filter..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vectors</SelectItem>
                  <SelectItem value="malware">Malware</SelectItem>
                  <SelectItem value="phishing">Phishing</SelectItem>
                  <SelectItem value="ransomware">Ransomware</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {isLoading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => (
                  <Card key={i} className="border-border bg-card/20 animate-pulse">
                    <CardContent className="p-6 h-32"></CardContent>
                  </Card>
                ))}
              </div>
            ) : feedData?.threats.length === 0 ? (
              <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg">No intelligence reports available.</div>
            ) : (
              <div className="space-y-4">
                {feedData?.threats.map(threat => (
                  <Card key={threat.id} className={`border-border bg-card/40 transition-colors hover:bg-card/60 ${threat.verified ? 'border-l-2 border-l-destructive' : ''}`}>
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex flex-col items-center justify-center gap-1 p-2 bg-background rounded-md border border-border min-w-[60px]">
                          <button 
                            className={`p-1 rounded hover:bg-primary/20 transition-colors ${threat.userVote === 1 ? 'text-primary' : 'text-muted-foreground'}`}
                            onClick={() => handleVote(threat.id, 1)}
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <span className={`font-mono font-bold text-sm ${threat.votes > 0 ? 'text-primary' : threat.votes < 0 ? 'text-destructive' : ''}`}>
                            {threat.votes > 0 ? '+' : ''}{threat.votes}
                          </span>
                          <button 
                            className={`p-1 rounded hover:bg-destructive/20 transition-colors ${threat.userVote === -1 ? 'text-destructive' : 'text-muted-foreground'}`}
                            onClick={() => handleVote(threat.id, -1)}
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-lg">{threat.domain}</span>
                              {threat.verified && (
                                <Badge variant="destructive" className="uppercase text-[10px] tracking-wider flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Verified
                                </Badge>
                              )}
                              {(() => {
                                const sev = getSeverity(threat.category);
                                return (
                                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 border ${sev.style}`}>
                                    {sev.icon}
                                    {sev.label}
                                    <span className="opacity-60 ml-0.5 font-normal">{sev.score}</span>
                                  </Badge>
                                );
                              })()}
                            </div>
                            <Badge variant="outline" className="border-primary text-primary capitalize">{threat.category}</Badge>
                          </div>
                          
                          <p className="text-sm text-muted-foreground">{threat.description}</p>
                          
                          <div className="text-xs text-muted-foreground/60 font-mono mt-2">
                            Logged: {format(new Date(threat.reportedAt), 'yyyy-MM-dd HH:mm:ss')}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
