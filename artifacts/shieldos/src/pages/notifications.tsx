import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, CheckCheck, Trash2, Plus, Zap, Wifi, Shield, AlertTriangle, Info, Edit2, X, Check, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Notification {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

interface AlertRule {
  id: number;
  ruleType: string;
  thresholdValue: number;
  thresholdWindowMinutes: number;
  channel: string;
  webhookUrl?: string | null;
  enabled: boolean;
  createdAt: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "text-red-500 bg-red-500/10 border-red-500/30",
  HIGH: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  MEDIUM: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  LOW: "text-muted-foreground bg-muted/10 border-border",
};

const RULE_TYPES = [
  { value: "THREAT_SPIKE", label: "Threat Spike" },
  { value: "NEW_DEVICE", label: "New Device Registered" },
  { value: "BLOCKLIST_UPDATED", label: "Blocklist Updated" },
  { value: "DEVICE_OFFLINE", label: "Device Offline" },
  { value: "HIGH_BLOCK_RATE", label: "High Block Rate" },
];

function TypeIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case "THREAT_SPIKE": return <Zap className={className} />;
    case "NEW_DEVICE": return <Wifi className={className} />;
    case "BLOCKLIST_UPDATED": return <Shield className={className} />;
    case "DEVICE_OFFLINE": return <AlertTriangle className={className} />;
    default: return <Info className={className} />;
  }
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Notification list ─────────────────────────────────────────────────────────
function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const { toast } = useToast();

  const load = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "25" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (readFilter !== "all") params.set("read", readFilter);
      const data = await apiFetch(`/api/v1/notifications?${params}`);
      setNotifications(data.notifications ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } catch {
      toast({ title: "Failed to load notifications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, [typeFilter, severityFilter, readFilter]);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast({ title: "All notifications marked as read" });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const deleteAll = async () => {
    if (!confirm("Delete all notifications?")) return;
    try {
      await apiFetch("/api/v1/notifications", { method: "DELETE" });
      setNotifications([]);
      setTotal(0);
      toast({ title: "All notifications deleted" });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const totalPages = Math.ceil(total / 25);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-8 text-xs bg-background font-mono">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {RULE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-36 h-8 text-xs bg-background font-mono">
            <SelectValue placeholder="All severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-32 h-8 text-xs bg-background font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="false">Unread</SelectItem>
            <SelectItem value="true">Read</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{total} total</span>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead} className="h-7 text-xs gap-1.5">
              <CheckCheck className="w-3 h-3" /> Mark all read
            </Button>
          )}
          {total > 0 && (
            <Button size="sm" variant="outline" onClick={deleteAll} className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="w-3 h-3" /> Delete all
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border-dashed border-border bg-transparent">
          <CardContent className="py-12 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">No notifications match this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                !n.read
                  ? "border-border bg-primary/3 hover:bg-primary/5"
                  : "border-border/50 bg-card/30 hover:bg-card/50"
              }`}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded border text-xs shrink-0 mt-0.5 ${SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.LOW}`}>
                <TypeIcon type={n.type} className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className={`text-sm font-bold font-mono ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] h-4 px-1 font-mono shrink-0 ${SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.LOW}`}
                  >
                    {n.severity}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground/60 font-mono ml-auto shrink-0">
                    {format(new Date(n.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
              {!n.read && (
                <button
                  onClick={() => markRead(n.id)}
                  className="shrink-0 mt-1 text-muted-foreground/40 hover:text-primary transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)} className="h-7 text-xs">← Prev</Button>
          <span className="text-xs text-muted-foreground font-mono">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)} className="h-7 text-xs">Next →</Button>
        </div>
      )}
    </div>
  );
}

// ── Alert rules manager ───────────────────────────────────────────────────────
function AlertRulesManager() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    rule_type: "THREAT_SPIKE",
    threshold_value: "10",
    threshold_window_minutes: "60",
    channel: "in_app",
    webhook_url: "",
  });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/v1/notifications/rules");
      setRules(data.rules ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiFetch("/api/v1/notifications/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          threshold_value: Number(form.threshold_value),
          threshold_window_minutes: Number(form.threshold_window_minutes),
          webhook_url: form.webhook_url || undefined,
        }),
      });
      setRules((prev) => [data.rule, ...prev]);
      setShowForm(false);
      setForm({ rule_type: "THREAT_SPIKE", threshold_value: "10", threshold_window_minutes: "60", channel: "in_app", webhook_url: "" });
      toast({ title: "Alert rule created" });
    } catch {
      toast({ title: "Failed to create rule", variant: "destructive" });
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      const data = await apiFetch(`/api/v1/notifications/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? data.rule : r));
    } catch {
      toast({ title: "Failed to update rule", variant: "destructive" });
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await apiFetch(`/api/v1/notifications/rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Rule deleted" });
    } catch {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    }
  };

  const testWebhook = async (url: string) => {
    try {
      await apiFetch("/api/v1/notifications/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      toast({ title: "Webhook test sent successfully" });
    } catch {
      toast({ title: "Webhook test failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create rules that trigger notifications when specific events occur.
        </p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} className="h-8 text-xs gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Rule
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-primary/20 bg-primary/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono">Create Alert Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createRule} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Event Type</label>
                  <Select value={form.rule_type} onValueChange={(v) => setForm((f) => ({ ...f, rule_type: v }))}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Channel</label>
                  <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-App</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(form.rule_type === "THREAT_SPIKE" || form.rule_type === "DEVICE_OFFLINE" || form.rule_type === "HIGH_BLOCK_RATE") && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Threshold</label>
                      <Input
                        type="number"
                        value={form.threshold_value}
                        onChange={(e) => setForm((f) => ({ ...f, threshold_value: e.target.value }))}
                        className="h-8 text-xs bg-background font-mono"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Window (minutes)</label>
                      <Input
                        type="number"
                        value={form.threshold_window_minutes}
                        onChange={(e) => setForm((f) => ({ ...f, threshold_window_minutes: e.target.value }))}
                        className="h-8 text-xs bg-background font-mono"
                        min="1"
                      />
                    </div>
                  </>
                )}
              </div>
              {form.channel === "webhook" && (
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Webhook URL</label>
                  <Input
                    placeholder="https://hooks.slack.com/services/..."
                    value={form.webhook_url}
                    onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                    className="h-8 text-xs bg-background font-mono"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-7 text-xs">Create Rule</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : rules.length === 0 ? (
        <Card className="border-dashed border-border bg-transparent">
          <CardContent className="py-10 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-mono">No alert rules yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create a rule to get notified when events occur.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                rule.enabled ? "border-border bg-card/40" : "border-border/40 bg-card/20 opacity-60"
              }`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded border border-primary/30 bg-primary/10 text-primary shrink-0">
                <TypeIcon type={rule.ruleType} className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold font-mono text-foreground">
                    {RULE_TYPES.find((r) => r.value === rule.ruleType)?.label ?? rule.ruleType}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono border-border text-muted-foreground">
                    {rule.channel}
                  </Badge>
                  {!rule.enabled && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono border-border text-muted-foreground">
                      disabled
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {(rule.ruleType === "THREAT_SPIKE" || rule.ruleType === "DEVICE_OFFLINE" || rule.ruleType === "HIGH_BLOCK_RATE")
                    ? `threshold: ${rule.thresholdValue} / window: ${rule.thresholdWindowMinutes}m`
                    : "Triggers on every occurrence"}
                  {rule.webhookUrl && <span className="ml-2">· {rule.webhookUrl.slice(0, 30)}...</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {rule.channel === "webhook" && rule.webhookUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => testWebhook(rule.webhookUrl!)}
                  >
                    Test
                  </Button>
                )}
                <button
                  onClick={() => toggleRule(rule)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title={rule.enabled ? "Disable" : "Enable"}
                >
                  {rule.enabled
                    ? <ToggleRight className="w-5 h-5 text-primary" />
                    : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Notifications() {
  const [tab, setTab] = useState<"notifications" | "rules">("notifications");

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Bell className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">NOTIFICATIONS</h1>
            </div>
            <p className="text-sm text-muted-foreground">Alerts, events, and automated notification rules.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-0">
          {[
            { key: "notifications", label: "Notification History" },
            { key: "rules", label: "Alert Rules" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-mono font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "notifications" ? <NotificationList /> : <AlertRulesManager />}
      </div>
    </AppShell>
  );
}
