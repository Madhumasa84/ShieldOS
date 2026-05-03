import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Download, Smartphone, Server, Shield, Wifi, QrCode, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ title: "Copied!", description: label ? `${label} copied to clipboard` : "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 px-2 text-muted-foreground hover:text-primary">
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function CodeBlock({ value, label }: { value: string; label?: string }) {
  return (
    <div className="relative group">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border border-border rounded-t-md">
        <span className="text-xs text-muted-foreground font-mono">{label ?? "value"}</span>
        <CopyButton value={value} label={label} />
      </div>
      <div className="px-3 py-2.5 bg-black/40 border border-t-0 border-border rounded-b-md font-mono text-sm text-primary break-all">
        {value}
      </div>
    </div>
  );
}

const steps = [
  {
    num: 1,
    icon: Download,
    title: "Download ShieldOS APK",
    description: "Download the latest ShieldOS Android app from GitHub Releases.",
    content: (serverUrl: string) => (
      <div className="space-y-3">
        <a
          href="https://github.com/shieldos-app/android/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-md text-primary text-sm font-mono hover:bg-primary/20 transition-colors"
        >
          <Download className="w-4 h-4" />
          ShieldOS-latest.apk
          <ExternalLink className="w-3 h-3 ml-1" />
        </a>
        <p className="text-xs text-muted-foreground">
          Enable "Install unknown apps" in Android Settings → Security if prompted.
        </p>
      </div>
    ),
  },
  {
    num: 2,
    icon: Server,
    title: "Enter Your Server URL",
    description: "Open the app and enter your ShieldOS server address. Scan the QR code for instant setup.",
    content: (serverUrl: string) => (
      <div className="space-y-4">
        <CodeBlock value={serverUrl} label="Server URL" />
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-2">Or scan with your Android camera:</p>
            <div className="w-fit p-2 bg-white rounded-lg border border-border">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(serverUrl)}&bgcolor=ffffff&color=000000&margin=1`}
                alt="QR code for server URL"
                width={160}
                height={160}
                className="block"
              />
            </div>
          </div>
          <div className="flex-1 mt-6">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-muted-foreground">POINT CAMERA HERE</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The app will automatically detect the ShieldOS server and pre-fill all connection details.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    num: 3,
    icon: Shield,
    title: "Login with Your Account",
    description: "Use your ShieldOS credentials to authenticate the Android app.",
    content: (serverUrl: string) => (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/20 border border-border rounded-md">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Endpoint</div>
            <div className="font-mono text-xs text-primary break-all">{serverUrl}/android/auth/login</div>
          </div>
          <div className="p-3 bg-muted/20 border border-border rounded-md">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Token Lifetime</div>
            <div className="font-mono text-xs text-primary">30 days</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The app stores your token securely in Android EncryptedSharedPreferences. Tokens auto-refresh before expiry.
        </p>
      </div>
    ),
  },
  {
    num: 4,
    icon: Wifi,
    title: 'Enable VPN — All Traffic Protected',
    description: "Tap the VPN toggle in the app. ShieldOS will filter all DNS traffic through the blocklist.",
    content: (serverUrl: string) => (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "DNS Queries", value: "< 2ms avg" },
            { label: "Blocked Domains", value: "88,000+" },
            { label: "Sync Interval", value: "Every 24h" },
          ].map((stat) => (
            <div key={stat.label} className="p-3 bg-muted/20 border border-border rounded-md text-center">
              <div className="text-sm font-bold text-primary font-mono">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          ShieldOS runs as a local VPN on Android, intercepting DNS queries and blocking trackers, ads, and malware domains before they can connect.
        </p>
      </div>
    ),
  },
];

export default function Setup() {
  const serverUrl = `https://${window.location.hostname}/api`;

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Smartphone className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">ANDROID_SETUP</h1>
            </div>
            <p className="text-muted-foreground text-sm">Connect the ShieldOS Android app to this server in 4 steps.</p>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
            v1.0
          </Badge>
        </div>

        <div className="space-y-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.num} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-base font-mono">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-bold shrink-0">
                      {step.num}
                    </div>
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span>{step.title}</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground ml-11">{step.description}</p>
                </CardHeader>
                <CardContent className="ml-11">
                  {step.content(serverUrl)}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0 shadow-[0_0_6px_var(--primary)]" />
              <div>
                <p className="text-sm font-mono text-primary font-bold mb-1">QUICK REFERENCE</p>
                <div className="space-y-1 text-xs text-muted-foreground font-mono">
                  <div><span className="text-primary/70">server</span>   <span className="break-all">{serverUrl}</span></div>
                  <div><span className="text-primary/70">docs   </span>  <span>{serverUrl}/android/docs</span></div>
                  <div><span className="text-primary/70">login  </span>  <span>POST {serverUrl}/android/auth/login</span></div>
                  <div><span className="text-primary/70">sync   </span>  <span>GET  {serverUrl}/v1/android/blocklist</span></div>
                  <div><span className="text-primary/70">dns    </span>  <span>POST {serverUrl}/v1/dns/query</span></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
