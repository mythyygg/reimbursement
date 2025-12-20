const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function toBase62(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return "0";
  let n = Math.floor(num);
  let out = "";
  while (n > 0) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

export function generateClientRequestId(): string {
  const timePart = toBase62(Date.now());
  const randPart = toBase62(Math.floor(Math.random() * 1e8));
  return `${timePart}${randPart}`;
}
