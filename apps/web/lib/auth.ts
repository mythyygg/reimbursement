const ACCESS_TOKEN_KEY = "reimbursement_access_token";
const REFRESH_TOKEN_KEY = "reimbursement_refresh_token";

export type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: Tokens) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
