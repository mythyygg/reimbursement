import { Context, Next } from "hono";

/**
 * 全局性能计时中间件
 * 记录每个API请求的总耗时
 */
export async function timingMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  console.log(`[API] --> ${method} ${path}`);

  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;

  // 根据耗时使用不同的日志级别
  if (duration > 1000) {
    console.warn(`[API] <-- ${method} ${path} ${status} [总计: ${duration}ms] ⚠️ SLOW`);
  } else if (duration > 500) {
    console.log(`[API] <-- ${method} ${path} ${status} [总计: ${duration}ms] ⚡`);
  } else {
    console.log(`[API] <-- ${method} ${path} ${status} [总计: ${duration}ms]`);
  }
}
