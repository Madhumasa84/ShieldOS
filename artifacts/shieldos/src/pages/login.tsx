import { useEffect } from "react";
import { useLocation } from "wouter";
import { clearTokens } from "@/lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    clearTokens();
    setLocation("/sign-in");
  }, [setLocation]);

  return null;
}
