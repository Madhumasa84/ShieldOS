import { Link, useLocation } from "wouter";
import { LayoutDashboard, Shield, ShieldAlert, MonitorSmartphone, Settings, LogOut } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { clearTokens, getUserRole } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/blocklist", label: "Blocklist", icon: Shield },
  { href: "/devices", label: "Devices", icon: MonitorSmartphone },
  { href: "/threats", label: "Threat Feed", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const role = getUserRole();
  const isAdmin = role === "admin";

  const handleLogout = () => {
    logoutMutation.mutate(
      { data: { refreshToken: localStorage.getItem("shieldos_refresh_token") || "" } },
      {
        onSettled: () => {
          clearTokens();
          setLocation("/login");
        },
      }
    );
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-sidebar flex flex-col font-mono z-50">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <ShieldAlert className="w-6 h-6 text-primary mr-3" />
        <span className="text-lg font-bold text-primary tracking-tight">SHIELD_OS</span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-primary/20 shadow-[0_0_10px_rgba(0,229,255,0.1)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-border space-y-2">
        {isAdmin && (
          <div className="px-4 py-1.5 rounded-md bg-primary/10 border border-primary/20 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Admin Access</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-left"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Terminate Session</span>
        </button>
      </div>
    </aside>
  );
}
