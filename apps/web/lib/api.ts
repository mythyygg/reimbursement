import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth";
import { env } from "./env";

export async function apiFetch<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetchWithAuth(`${env.apiBase}${input}`, init);
  if (response.ok) {
    const payload = await response.json();
    return payload.data as T;
  }

  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retry = await fetchWithAuth(`${env.apiBase}${input}`, init);
      if (retry.ok) {
        const payload = await retry.json();
        return payload.data as T;
      }
    }
    // Token missing/invalid or refresh failed: force logout to avoid silent loops.
    clearTokens();
    if (typeof window !== "undefined") {
      const next = window.location.pathname;
      window.location.href = `/login${
        next ? `?next=${encodeURIComponent(next)}` : ""
      }`;
    }
  }

  const body = await response.json().catch(() => ({}));
  throw new Error(body?.error?.message || "Request failed");
}

async function fetchWithAuth(input: string, init?: RequestInit) {
  const accessToken = getAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("content-type", "application/json");
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return fetch(input, { ...init, headers });
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return false;
  }

  const response = await fetch(`${env.apiBase}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return false;
  }

  const data = await response.json();
  setTokens(data.data.tokens);
  return true;
}
