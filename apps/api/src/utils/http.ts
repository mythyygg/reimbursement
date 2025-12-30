import type { Context } from "hono";

/**
 * 返回错误响应
 *
 * @param c - Hono上下文对象
 * @param status - HTTP状态码，如 400、401、404、500等
 * @param code - 错误代码，用于前端识别错误类型，如 "INVALID_INPUT"、"UNAUTHORIZED"
 * @param message - 错误消息，人类可读的错误描述
 * @returns JSON格式的错误响应
 *
 * @description
 * 统一的错误响应格式：
 * ```json
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "错误描述"
 *   }
 * }
 * ```
 *
 * @example
 * errorResponse(c, 400, "INVALID_INPUT", "费用金额必须为正数")
 * errorResponse(c, 401, "UNAUTHORIZED", "未登录或登录已过期")
 * errorResponse(c, 404, "NOT_FOUND", "项目不存在")
 */
export function errorResponse(
  c: Context,
  status: number,
  code: string,
  message: string
) {
  return c.json(
    {
      error: {
        code,
        message
      }
    },
    status as 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500
  );
}

/**
 * 返回成功响应
 *
 * @param c - Hono上下文对象
 * @param data - 响应数据，可以是任意类型的对象
 * @returns JSON格式的成功响应
 *
 * @description
 * 统一的成功响应格式：
 * ```json
 * {
 *   "data": { ... }
 * }
 * ```
 *
 * @example
 * ok(c, { projectId: "123", name: "差旅费用" })
 * ok(c, { expenses: [...], total: 10 })
 */
export function ok<T>(c: Context, data: T) {
  return c.json({ data });
}
