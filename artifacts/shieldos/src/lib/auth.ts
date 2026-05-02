export function getAuthToken() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("shieldos_access_token");
  }
  return null;
}

export function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shieldos_access_token", token);
  }
}

export function setRefreshToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("shieldos_refresh_token", token);
  }
}

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
    localStorage.removeItem("shieldos_access_token");
    localStorage.removeItem("shieldos_refresh_token");
    localStorage.removeItem("shieldos_role");
  }
}

export function isAuthenticated() {
  return !!getAuthToken();
}
