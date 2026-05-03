import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "./notification-bell";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-mono flex dark">
      <Sidebar />
      <main className="ml-64 flex-1 flex flex-col min-h-screen relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <header className="relative z-20 flex items-center justify-end px-8 h-12 border-b border-border/50 bg-background/60 backdrop-blur-sm">
          <NotificationBell />
        </header>
        <div className="relative z-10 flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
