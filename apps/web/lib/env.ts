const rawApiBase = process.env.NEXT_PUBLIC_API_BASE;

if (!rawApiBase) {
  // Avoid hard-failing at build time; runtime API calls will validate instead.
  console.warn("NEXT_PUBLIC_API_BASE is not set. API requests will fail until configured.");
}

const normalizedApiBase = (() => {
  if (!rawApiBase) {
    return "";
  }
  const trimmed = rawApiBase.replace(/\/$/, "");
  // If caller already provided a versioned API prefix (e.g. /api/v1 or /api/v2), keep it.
  if (/\/api\/v\d+(\/.*)?$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
})();

export const env = {
  apiBase: normalizedApiBase,
};
