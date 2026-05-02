import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { setAuthToken, setRefreshToken, setUserRole } from "@/lib/auth";
import { ShieldAlert, Terminal, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          setAuthToken(res.accessToken);
          setRefreshToken(res.refreshToken);
          setUserRole((res as any).role ?? "user");
          toast({ title: "Access Granted", description: "Session established." });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message || err?.message || "Invalid username or password.";
          toast({ title: "Authentication Failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4 font-mono dark relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-primary/5 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-primary/10 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-primary/20 rounded-full pointer-events-none shadow-[0_0_40px_rgba(0,229,255,0.1)]" />

      <div className="z-10 w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary uppercase">Shield_OS</h1>
          <p className="text-muted-foreground mt-2 text-sm uppercase tracking-widest">Privacy Command Center</p>
        </div>

        <Card className="border-primary/20 shadow-[0_0_20px_rgba(0,229,255,0.05)] bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              Terminal Login
            </CardTitle>
            <CardDescription>Enter credentials to access the secure network.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operator ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="sysadmin"
                          className="bg-background border-border focus-visible:ring-primary font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Passphrase</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="bg-background border-border focus-visible:ring-primary pl-9 font-mono"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full font-mono font-bold uppercase tracking-wider mt-6"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Authenticating..." : "Initialize Session"}
                </Button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => setLocation("/register")}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
                  >
                    Request new operator profile
                  </button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
