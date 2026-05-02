import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Activity, Clock, Users, ShieldCheck, RefreshCw, Ban, ChevronUp, ChevronDown, KeyRound, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { getAuthToken, isAdmin as checkIsAdmin } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  deviceCount: number;
}

function useAdminUsers(enabled: boolean) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = getAuthToken();

  const fetch = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch("/api/v1/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return { users, loading, error, refetch: fetch };
}

function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <Badge className="bg-primary/20 text-primary border-primary/30 font-mono text-xs">ADMIN</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground font-mono text-xs">USER</Badge>
  );
}

function AdminUsersTab() {
  const { users, loading, error, refetch } = useAdminUsers(true);
  const { toast } = useToast();
  const token = getAuthToken();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const callApi = async (path: string, method: string, body?: object) => {
    const res = await window.fetch(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Request failed");
    }
    return res.json();
  };

  const promoteUser = async (u: AdminUser) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    setActionLoading(`role-${u.id}`);
    try {
      await callApi(`/v1/admin/users/${u.id}/role`, "PATCH", { role: newRole });
      toast({ title: "Role updated", description: `${u.username} is now ${newRole}.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleStatus = async (u: AdminUser) => {
    setActionLoading(`status-${u.id}`);
    try {
      await callApi(`/v1/admin/users/${u.id}/status`, "PATCH", { isActive: !u.isActive });
      toast({
        title: u.isActive ? "User deactivated" : "User activated",
        description: u.username,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const resetPassword = async (u: AdminUser) => {
    setActionLoading(`pwd-${u.id}`);
    try {
      const data = await callApi(`/v1/admin/users/${u.id}/reset-password`, "POST");
      await navigator.clipboard.writeText(data.tempPassword).catch(() => {});
      setCopiedId(u.id);
      setTimeout(() => setCopiedId(null), 3000);
      toast({
        title: "Password reset",
        description: `Temp password for ${u.username} copied to clipboard: ${data.tempPassword}`,
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (!users && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Users className="w-12 h-12 text-primary/30" />
        <p className="text-muted-foreground text-sm">Load the operator roster to manage users.</p>
        <Button onClick={refetch} className="font-mono uppercase text-xs tracking-wider">
          Load Users
        </Button>
      </div>
    );
  }

  if (loading && !users) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-primary/10" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-sm text-center py-8">{error}</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-mono">{users?.length ?? 0} operators registered</span>
        <Button variant="ghost" size="sm" onClick={refetch} disabled={loading} className="h-7 px-2">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {users?.map((u) => (
        <div
          key={u.id}
          className={`bg-background rounded-md border p-4 transition-colors ${
            u.isActive ? "border-border" : "border-border/50 opacity-60"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                u.role === "admin" ? "bg-primary/20 border border-primary/30" : "bg-muted border border-border"
              }`}>
                <User className={`w-4 h-4 ${u.role === "admin" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold font-mono truncate">{u.username}</span>
                  <RoleBadge role={u.role} />
                  {!u.isActive && (
                    <Badge variant="outline" className="text-destructive border-destructive/30 text-xs font-mono">
                      SUSPENDED
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-mono flex-wrap">
                  <span>#{u.id.toString().padStart(6, "0")}</span>
                  <span>{u.deviceCount} device{u.deviceCount !== 1 ? "s" : ""}</span>
                  <span>joined {format(new Date(u.createdAt), "MMM d, yyyy")}</span>
                  {u.lastLoginAt && (
                    <span>last login {format(new Date(u.lastLoginAt), "MMM d HH:mm")}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => promoteUser(u)}
                disabled={!!actionLoading}
                className="h-8 px-2 text-xs font-mono"
                title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
              >
                {actionLoading === `role-${u.id}` ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : u.role === "admin" ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronUp className="w-3 h-3 mr-1" />
                )}
                {u.role === "admin" ? "Demote" : "Promote"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetPassword(u)}
                disabled={!!actionLoading}
                className="h-8 px-2 text-xs font-mono"
                title="Reset password"
              >
                {actionLoading === `pwd-${u.id}` ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : copiedId === u.id ? (
                  <Check className="w-3 h-3 text-primary" />
                ) : (
                  <KeyRound className="w-3 h-3" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleStatus(u)}
                disabled={!!actionLoading || u.role === "admin"}
                className={`h-8 px-2 text-xs font-mono ${
                  u.isActive
                    ? "hover:text-destructive hover:bg-destructive/10"
                    : "hover:text-primary hover:bg-primary/10"
                }`}
                title={u.role === "admin" ? "Cannot deactivate admin" : u.isActive ? "Deactivate" : "Activate"}
              >
                {actionLoading === `status-${u.id}` ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Ban className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const token = getAuthToken();
  const isAdminUser = checkIsAdmin();
  const [activeTab, setActiveTab] = useState<"profile" | "users">("profile");
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: ["me"], enabled: !!token },
  });

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: User },
    ...(isAdminUser ? [{ id: "users" as const, label: "Users", icon: Users }] : []),
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Operator configuration and system management.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <Card className="border-primary/20 shadow-[0_0_15px_rgba(0,229,255,0.05)] bg-card/50">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Operator Profile
              </CardTitle>
              <CardDescription>Current session authentication details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full bg-primary/10" />
                  <Skeleton className="h-12 w-full bg-primary/10" />
                  <Skeleton className="h-12 w-full bg-primary/10" />
                </div>
              ) : user ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-background p-4 rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Operator ID</div>
                    <div className="font-bold text-lg">{user.username}</div>
                  </div>
                  <div className="bg-background p-4 rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">System ID</div>
                    <div className="font-mono text-primary">#{user.id.toString().padStart(6, "0")}</div>
                  </div>
                  <div className="bg-background p-4 rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Access Level
                    </div>
                    <div className="flex items-center gap-2">
                      {(user as any).role === "admin" ? (
                        <span className="text-primary font-bold font-mono">ADMIN</span>
                      ) : (
                        <span className="text-muted-foreground font-mono">USER</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-background p-4 rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Provisioned At
                    </div>
                    <div className="font-mono text-sm">
                      {format(new Date(user.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </div>
                  </div>
                  <div className="bg-background p-4 rounded-md border border-border md:col-span-2">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Status
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          user.isActive
                            ? "bg-primary shadow-[0_0_8px_var(--primary)]"
                            : "bg-muted"
                        }`}
                      />
                      <span className={user.isActive ? "text-primary font-bold" : "text-muted-foreground"}>
                        {user.isActive ? "ACTIVE" : "SUSPENDED"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">Unable to retrieve operator data.</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Users Tab (admin only) */}
        {activeTab === "users" && isAdminUser && (
          <Card className="border-primary/20 shadow-[0_0_15px_rgba(0,229,255,0.05)] bg-card/50">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Operator Roster
              </CardTitle>
              <CardDescription>
                Manage all system operators. Promote to admin, deactivate, or reset credentials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminUsersTab />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
