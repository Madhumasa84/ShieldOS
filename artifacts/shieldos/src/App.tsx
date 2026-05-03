import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isAuthenticated, setAuthenticated, clearTokens } from "@/lib/auth";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Setup from "@/pages/setup";
import ApiDocs from "@/pages/api-docs";
import NotificationsPage from "@/pages/notifications";
import Analytics from "@/pages/analytics";
import Dashboard from "@/pages/dashboard";
import Blocklist from "@/pages/blocklist";
import Devices from "@/pages/devices";
import Threats from "@/pages/threats";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#00e5ff",
    colorForeground: "#e2e8f0",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#ef4444",
    colorBackground: "#0d1117",
    colorInput: "#161b22",
    colorInputForeground: "#e2e8f0",
    colorNeutral: "#30363d",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#e2e8f0] font-mono font-semibold tracking-wider",
    headerSubtitle: "text-[#94a3b8] font-mono text-sm",
    socialButtonsBlockButtonText: "text-[#e2e8f0] font-mono text-sm",
    formFieldLabel: "text-[#94a3b8] font-mono text-xs uppercase tracking-widest",
    footerActionLink: "text-[#00e5ff] font-mono text-sm hover:text-[#00e5ff]/80",
    footerActionText: "text-[#94a3b8] font-mono text-sm",
    dividerText: "text-[#94a3b8] font-mono text-xs",
    identityPreviewEditButton: "text-[#00e5ff] font-mono",
    formFieldSuccessText: "text-[#22c55e] font-mono text-xs",
    alertText: "text-[#e2e8f0] font-mono text-sm",
    logoBox: "flex justify-center py-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] transition-colors font-mono",
    formButtonPrimary: "bg-[#00e5ff] text-[#0d1117] hover:bg-[#00e5ff]/90 font-mono font-semibold tracking-wider uppercase text-sm transition-colors",
    formFieldInput: "bg-[#161b22] border-[#30363d] text-[#e2e8f0] font-mono placeholder:text-[#4b5563] focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]/40",
    footerAction: "border-t border-[#30363d]",
    dividerLine: "bg-[#30363d]",
    alert: "border border-[#ef4444]/40 bg-[#ef4444]/10 rounded",
    otpCodeFieldInput: "bg-[#161b22] border-[#30363d] text-[#e2e8f0] font-mono",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4 font-mono dark relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10 w-full max-w-md">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4 font-mono dark relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10 w-full max-w-md">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {() => {
        if (!isAuthenticated()) {
          clearTokens();
          return <Redirect to="/sign-in" />;
        }
        return <Component />;
      }}
    </Route>
  );
}

// Sync Clerk sign-in state into our localStorage flag
function ClerkAuthSync() {
  const { user } = useClerk() as any;
  useEffect(() => {
    if (user) {
      const role = (user.publicMetadata as any)?.role ?? "user";
      setAuthenticated(role);
    }
  }, [user]);
  return null;
}

function Router() {
  return (
    <>
      <ClerkAuthSync />
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        {/* Clerk-powered sign-in/sign-up */}
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />

        {/* Legacy username/password login kept for backward-compat */}
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />

        {/* Public landing page */}
        <Route path="/" component={() => isAuthenticated() ? <Redirect to="/dashboard" /> : <Landing />} />

        {/* Protected app routes */}
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/blocklist" component={Blocklist} />
        <ProtectedRoute path="/devices" component={Devices} />
        <ProtectedRoute path="/threats" component={Threats} />
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/setup" component={Setup} />
        <ProtectedRoute path="/api-docs" component={ApiDocs} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <ProtectedRoute path="/analytics" component={Analytics} />

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      afterSignOutUrl={`${basePath}/sign-in`}
      localization={{
        signIn: {
          start: {
            title: "SHIELD_OS",
            subtitle: "Sign in to access the privacy command center",
          },
        },
        signUp: {
          start: {
            title: "CREATE ACCOUNT",
            subtitle: "Join the ShieldOS privacy network",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Switch>
              <Route path="/login" component={Login} />
              <Route path="/register" component={Register} />
              <Route component={Login} />
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
