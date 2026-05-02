import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-mono flex dark">
      <Sidebar />
      <main className="ml-64 flex-1 flex flex-col min-h-screen relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="relative z-10 flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
