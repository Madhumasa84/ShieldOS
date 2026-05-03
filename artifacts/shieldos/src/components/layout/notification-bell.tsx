import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Bell, Check, CheckCheck, Trash2, X, AlertTriangle, Info, Shield, Wifi, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "text-red-500 bg-red-500/10 border-red-500/30",
  HIGH: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  MEDIUM: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  LOW: "text-muted-foreground bg-muted/10 border-border",
};

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]",
  HIGH: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.7)]",
  MEDIUM: "bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]",
  LOW: "bg-muted-foreground",
};

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "THREAT_SPIKE": return <Zap className="w-3.5 h-3.5" />;
    case "NEW_DEVICE": return <Wifi className="w-3.5 h-3.5" />;
    case "BLOCKLIST_UPDATED": return <Shield className="w-3.5 h-3.5" />;
    case "DEVICE_OFFLINE": return <AlertTriangle className="w-3.5 h-3.5" />;
    default: return <Info className="w-3.5 h-3.5" />;
  }
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/api/v1/notifications?limit=20");
      setNotifications(data.notifications ?? []);
      setUnreadCount((data.notifications ?? []).filter((n: Notification) => !n.read).length);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 30s
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // SSE real-time
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/v1/notifications/stream", { withCredentials: true });

      es.addEventListener("notification", (e) => {
        try {
          const notif: Notification = JSON.parse(e.data);
          setNotifications((prev) => [notif, ...prev].slice(0, 20));
          setUnreadCount((c) => c + 1);
          toast({
            title: notif.title,
            description: notif.message,
            variant: notif.severity === "CRITICAL" || notif.severity === "HIGH" ? "destructive" : "default",
          });
        } catch {}
      });

      es.onerror = () => {
        es?.close();
        retryTimeout = setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, [toast]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const deleteAll = async () => {
    try {
      await apiFetch("/api/v1/notifications", { method: "DELETE" });
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  const handleNotifClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold font-mono leading-none shadow-[0_0_6px_rgba(239,68,68,0.6)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-card border border-border rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold font-mono text-foreground">ALERTS</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 font-mono">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" onClick={markAllRead} className="h-6 px-2 text-xs text-muted-foreground" title="Mark all read">
                  <CheckCheck className="w-3.5 h-3.5" />
                </Button>
              )}
              {notifications.length > 0 && (
                <Button size="sm" variant="ghost" onClick={deleteAll} className="h-6 px-2 text-xs text-muted-foreground" title="Delete all">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-6 px-2 text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[400px]">
            {loading && notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground font-mono">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-mono">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/20 ${
                    !n.read ? "bg-primary/3" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${!n.read ? SEVERITY_DOT[n.severity] ?? "bg-primary" : "bg-transparent"}`} />
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-[10px] ${SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.LOW}`}>
                      <TypeIcon type={n.type} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className={`text-xs font-bold truncate ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">
                        {format(new Date(n.createdAt), "HH:mm")}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-primary transition-colors"
                      title="Mark read"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <button
              onClick={() => { navigate("/notifications"); setOpen(false); }}
              className="text-xs text-primary hover:underline font-mono w-full text-center"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
