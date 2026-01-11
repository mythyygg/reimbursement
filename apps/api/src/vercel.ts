import app from "./index";
import { handle } from "hono/vercel";

// Vercel Node.js runtime (serverless). Edge is not suitable because we rely on Node APIs (pg, aws-sdk).
export const config = { runtime: "nodejs" };

// Shared handler for all HTTP methods.
export const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

// Default export for compatibility with some runtimes.
export default handler;
