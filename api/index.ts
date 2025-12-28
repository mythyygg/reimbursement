/**
 * Vercel Serverless Function 入口
 *
 * 用于将 Hono 应用适配到 Vercel Serverless Functions
 */

import "../apps/api/src/env.js";
import app from "../apps/api/src/index.js";

// Vercel serverless 导出
export default app.fetch;
