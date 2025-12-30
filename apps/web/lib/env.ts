const apiBase = process.env.NEXT_PUBLIC_API_BASE;

if (!apiBase) {
  throw new Error("NEXT_PUBLIC_API_BASE is required");
}

export const env = {
  apiBase,
};
