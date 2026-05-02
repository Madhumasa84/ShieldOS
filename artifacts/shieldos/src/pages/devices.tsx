import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useListDevices, useProvisionDevice, useRevokeDevice, useGetVpnStatus, getListDevicesQueryKey, getGetVpnStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MonitorSmartphone, Plus, ShieldOff, Key, Download, Check, AlertTriangle, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function Devices() {
  const [newDeviceName, setNewDeviceName] = useState("");
  const [configContent, setConfigContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: loadingStatus } = useGetVpnStatus({ query: { queryKey: getGetVpnStatusQueryKey() } });
  const { data: listData, isLoading } = useListDevices({ query: { queryKey: getListDevicesQueryKey() } });

  const provisionMutation = useProvisionDevice();
  const revokeMutation = useRevokeDevice();

  const handleProvision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName) return;

    provisionMutation.mutate({ data: { deviceName: newDeviceName } }, {
      onSuccess: (res) => {
        toast({ title: "Node Provisioned", description: `${newDeviceName} successfully initialized.` });
        setNewDeviceName("");
        setConfigContent(res.configContent);
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVpnStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Provisioning Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleRevoke = (deviceId: number, name: string) => {
    if (!confirm(`Are you sure you want to permanently revoke access for ${name}?`)) return;
    
    revokeMutation.mutate({ deviceId }, {
      onSuccess: () => {
        toast({ title: "Access Revoked", description: `${name} has been disconnected.` });
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVpnStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Revocation Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const copyConfig = () => {
    if (configContent) {
      navigator.clipboard.writeText(configContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadConfig = () => {
    if (configContent) {
      const blob = new Blob([configContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldos-${newDeviceName || 'vpn'}.conf`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2 uppercase tracking-tight">VPN Nodes</h1>
          <p className="text-muted-foreground">Manage secure WireGuard tunnels and client devices.</p>
        </div>

        {/* Server Status */}
        <Card className="border-primary/20 bg-card/40 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Secure Gateway Status</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                    Operational
                  </div>
                </div>
              </div>
              
              <div className="flex gap-8">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Active Nodes</div>
                  <div className="text-2xl font-mono font-bold text-primary">{status?.activeDevices || 0}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total Provisioned</div>
                  <div className="text-2xl font-mono font-bold">{status?.totalDevices || 0}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Server Uptime</div>
                  <div className="text-xl font-mono font-bold mt-1">{status?.serverUptime || 'N/A'}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Provision Form */}
          <Card className="col-span-1 border-border bg-card/50 h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Provision Node
              </CardTitle>
              <CardDescription>Generate configuration for a new secure device.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProvision} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase text-muted-foreground">Device Identifier</label>
                  <Input 
                    placeholder="e.g. mobile-alpha" 
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="font-mono bg-background"
                  />
                </div>
                <Button type="submit" className="w-full uppercase font-bold tracking-wider" disabled={provisionMutation.isPending || !newDeviceName}>
                  {provisionMutation.isPending ? "Generating Keys..." : "Generate Config"}
                </Button>
                <div className="flex items-start gap-2 mt-4 text-xs text-muted-foreground p-3 bg-muted/30 rounded border border-border">
                  <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
                  <p>Configuration files contain private keys and will only be shown once.</p>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* List */}
          <div className="col-span-1 lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold mb-4 uppercase tracking-wider">Provisioned Nodes</h3>
            
            {isLoading ? (
              <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg">Scanning network...</div>
            ) : listData?.devices.length === 0 ? (
              <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg">No nodes currently provisioned.</div>
            ) : (
              <div className="grid gap-3">
                {listData?.devices.map(device => (
                  <Card key={device.id} className="border-border bg-card/50 overflow-hidden transition-all hover:border-primary/30">
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          <div className={`p-2 rounded border ${device.isActive ? 'bg-primary/10 border-primary/20 text-primary shadow-[0_0_10px_rgba(0,229,255,0.1)]' : 'bg-muted border-border text-muted-foreground'}`}>
                            <MonitorSmartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold flex items-center gap-2">
                              {device.name}
                              {device.isActive && <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-1">
                              <Key className="w-3 h-3" />
                              {device.publicKey.substring(0, 16)}...
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between w-full sm:w-auto gap-6 bg-background/50 p-2 rounded border border-border sm:bg-transparent sm:border-0 sm:p-0">
                          <div className="text-center">
                            <div className="text-[10px] uppercase text-muted-foreground">Intercepts</div>
                            <div className="font-mono font-bold text-sm text-primary">{device.blockedCount.toLocaleString()}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] uppercase text-muted-foreground">Provisioned</div>
                            <div className="font-mono text-xs">{format(new Date(device.createdAt), 'MM/dd/yy')}</div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
                            onClick={() => handleRevoke(device.id, device.name)}
                            disabled={revokeMutation.isPending}
                          >
                            <ShieldOff className="w-4 h-4 mr-1" />
                            Revoke
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <Dialog open={!!configContent} onOpenChange={(open) => !open && setConfigContent(null)}>
          <DialogContent className="max-w-2xl bg-card border-primary/30 shadow-[0_0_40px_rgba(0,229,255,0.1)] font-mono">
            <DialogHeader>
              <DialogTitle className="text-primary flex items-center gap-2 text-xl">
                <Key className="w-5 h-5" />
                Node Provisioned Successfully
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                WireGuard configuration for the new node. This contains private keys and will not be shown again.
              </DialogDescription>
            </DialogHeader>
            
            <div className="relative bg-[#0A0A0F] border border-border rounded-md p-4 mt-4">
              <pre className="text-xs text-primary/90 overflow-x-auto whitespace-pre-wrap break-all">
                {configContent}
              </pre>
            </div>

            <DialogFooter className="mt-6 flex sm:justify-between">
              <p className="text-xs text-destructive flex items-center gap-1 self-center">
                <AlertTriangle className="w-3 h-3" /> Save this securely.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={copyConfig} className="bg-background">
                  {copied ? <Check className="w-4 h-4 mr-2" /> : null}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button onClick={downloadConfig} className="font-bold">
                  <Download className="w-4 h-4 mr-2" />
                  Download .conf
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
