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

export function clearTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("shieldos_access_token");
    localStorage.removeItem("shieldos_refresh_token");
  }
}

export function isAuthenticated() {
  return !!getAuthToken();
}
