import { useState } from "react";
import { useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { setAuthenticated } from "@/lib/auth";
import { ShieldAlert, Terminal, Lock, User, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "Minimum 3 characters")
      .max(32, "Maximum 32 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores"),
    password: z.string().min(8, "Minimum 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

function getStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score === 2) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score === 3) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-primary" };
}

const requirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const [passwordValue, setPasswordValue] = useState("");

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  const strength = getStrength(passwordValue);

  const onSubmit = (data: RegisterFormValues) => {
    registerMutation.mutate(
      { data: { username: data.username, password: data.password } },
      {
        onSuccess: (res) => {
          setAuthenticated((res as any).role ?? "user");
          toast({ title: "Profile Created", description: "Welcome to ShieldOS." });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message || err?.message || "Registration failed.";
          toast({ title: "Registration Failed", description: msg, variant: "destructive" });
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
              Operator Registration
            </CardTitle>
            <CardDescription>Provision a new command profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Username */}
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operator ID</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="alphanumeric_id"
                            className="bg-background border-border focus-visible:ring-primary pl-9 font-mono"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password */}
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
                            onChange={(e) => {
                              field.onChange(e);
                              setPasswordValue(e.target.value);
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />

                      {/* Strength meter */}
                      {passwordValue.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <div className="flex gap-1 h-1.5">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className={cn(
                                  "flex-1 rounded-full transition-all",
                                  strength.score >= i ? strength.color : "bg-muted"
                                )}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">Strength:</span>
                            <span className={cn("text-xs font-bold", strength.score >= 4 ? "text-primary" : strength.score >= 3 ? "text-blue-400" : strength.score >= 2 ? "text-yellow-400" : "text-red-400")}>
                              {strength.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 mt-1">
                            {requirements.map((r) => {
                              const met = r.test(passwordValue);
                              return (
                                <div key={r.label} className="flex items-center gap-1.5">
                                  {met ? (
                                    <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                                  ) : (
                                    <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={cn("text-xs", met ? "text-primary" : "text-muted-foreground")}>
                                    {r.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                {/* Confirm Password */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Passphrase</FormLabel>
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
                  className="w-full font-mono font-bold uppercase tracking-wider mt-2"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Provisioning..." : "Create Profile"}
                </Button>

                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => setLocation("/login")}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
                  >
                    Already have an operator profile? Login
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
