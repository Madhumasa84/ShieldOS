// Tokens are stored in httpOnly cookies set by the server.
// This module manages non-sensitive session metadata kept in localStorage.

export function setUserRole(role: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shieldos_role", role);
  }
}

export function getUserRole(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("shieldos_role") ?? "user";
  }
  return "user";
}

export function isAdmin(): boolean {
  return getUserRole() === "admin";
}

export function clearTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("shieldos_role");
    localStorage.removeItem("shieldos_authenticated");
  }
}

export function setAuthenticated(role: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shieldos_role", role);
    localStorage.setItem("shieldos_authenticated", "1");
  }
}

export function isAuthenticated() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("shieldos_authenticated") === "1";
  }
  return false;
}
