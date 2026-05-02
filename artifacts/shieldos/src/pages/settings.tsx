import { AppShell } from "@/components/layout/app-shell";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Activity, Clock } from "lucide-react";
import { format } from "date-fns";
import { getAuthToken } from "@/lib/auth";

export default function Settings() {
  const token = getAuthToken();
  const { data: user, isLoading } = useGetMe({
    query: {
      enabled: !!token,
    },
  });

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Operator configuration and profile status.</p>
        </div>

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
                  <div className="font-mono text-primary">#{user.id.toString().padStart(6, '0')}</div>
                </div>
                <div className="bg-background p-4 rounded-md border border-border">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Provisioned At
                  </div>
                  <div className="font-mono text-sm">{format(new Date(user.createdAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                </div>
                <div className="bg-background p-4 rounded-md border border-border">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Status
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-muted'}`} />
                    <span className={user.isActive ? 'text-primary font-bold' : 'text-muted-foreground'}>
                      {user.isActive ? 'ACTIVE' : 'SUSPENDED'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">Unable to retrieve operator data.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
