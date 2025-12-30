import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { logInfo, logWarn } from "../utils/logger.js";

/**
 * 全局性能计时中间件
 * 记录每个API请求的总耗时
 */
export async function timingMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  let status = 500;

  try {
    await next();
    status = c.res.status;
  } catch (error) {
    status = error instanceof HTTPException ? error.status : 500;
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    const requestId = c.get("requestId");

    // 根据耗时使用不同的日志级别
    if (duration > 1000) {
      logWarn("request.slow", {
        requestId,
        method,
        path,
        status,
        durationMs: duration,
      });
    } else {
      logInfo("request.completed", {
        requestId,
        method,
        path,
        status,
        durationMs: duration,
      });
    }
  }
}
