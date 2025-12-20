import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { authSessions, users } from "@reimbursement/shared/db";
import { db } from "../db/client";
import { verifyAccessToken } from "../services/auth";
import { errorResponse } from "../utils/http";

/**
 * 认证上下文类型
 * 存储在 Hono 上下文变量中，供所有需要认证的路由使用
 */
export type AuthContext = {
  /** 当前登录用户的ID */
  userId: string;
  /** 当前会话的ID */
  sessionId: string;
  /** 用户的会话版本号 - 用于批量撤销所有会话 */
  sessionVersion: number;
};

/**
 * 认证中间件
 *
 * @description
 * 验证请求的 JWT 访问令牌，确保用户已登录且会话有效。
 *
 * 验证流程：
 * 1. 检查 Authorization 头是否存在且格式正确（Bearer {token}）
 * 2. 验证 JWT 令牌签名和过期时间
 * 3. 检查会话是否存在且未被撤销
 * 4. 检查用户是否存在且状态为活跃
 * 5. 检查会话版本号是否匹配（防止批量撤销后的旧令牌）
 * 6. 将认证信息存入上下文供后续路由使用
 *
 * 错误响应：
 * - 401 AUTH_REQUIRED: 缺少 Authorization 头
 * - 401 TOKEN_INVALID: 令牌格式错误、签名无效或已过期
 * - 401 SESSION_REVOKED: 会话已被撤销或版本号不匹配
 * - 401 USER_INACTIVE: 用户账户已被禁用或删除
 *
 * @example
 * // 在路由中使用
 * app.use('/api/*', authMiddleware)
 * app.get('/api/projects', (c) => {
 *   const { userId } = c.get('auth')
 *   // ... 处理请求
 * })
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  // 1. 检查 Authorization 头
  const header = c.req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return errorResponse(c, 401, "AUTH_REQUIRED", "Authorization required");
  }

  try {
    // 2. 提取并验证 JWT 令牌
    const token = header.replace("Bearer ", "");
    const payload = await verifyAccessToken(token);
    const sessionId = payload.sessionId;
    const userId = payload.sub;

    // 检查payload是否包含必需字段
    if (!sessionId || !userId) {
      return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
    }

    // 3. 检查会话是否存在且未被撤销
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.sessionId, sessionId));

    if (!session || session.revokedAt) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 4. 检查用户是否存在且状态为活跃
    const [user] = await db.select().from(users).where(eq(users.userId, userId));
    if (!user || user.status !== "active") {
      return errorResponse(c, 401, "USER_INACTIVE", "User inactive");
    }

    // 5. 检查会话版本号是否匹配（批量撤销机制）
    if (user.sessionVersion !== payload.sessionVersion) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 6. 将认证信息存入上下文
    c.set("auth", {
      userId,
      sessionId,
      sessionVersion: payload.sessionVersion
    } satisfies AuthContext);

    // 继续处理请求
    return next();
  } catch (error) {
    // JWT验证失败（签名错误、过期等）
    return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
  }
});
