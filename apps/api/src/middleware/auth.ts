/**
 * JWT 认证中间件
 *
 * 【Java 对比 - 类似 Spring Security Filter】
 *
 * 本中间件等同于 Spring Security 的认证过滤器：
 * ```java
 * @Component
 * public class JwtAuthenticationFilter extends OncePerRequestFilter {
 *     @Override
 *     protected void doFilterInternal(
 *         HttpServletRequest request,
 *         HttpServletResponse response,
 *         FilterChain filterChain
 *     ) {
 *         // 1. 从请求头提取 JWT
 *         // 2. 验证JWT签名和过期时间
 *         // 3. 从数据库验证会话有效性
 *         // 4. 将用户信息存入 SecurityContext
 *         // 5. 继续过滤链
 *         filterChain.doFilter(request, response);
 *     }
 * }
 * ```
 *
 * 【中间件机制】
 * - 中间件是请求处理管道中的一环
 * - 类似 Servlet Filter 或 Spring Interceptor
 * - 可以在请求到达路由处理器之前进行预处理
 * - 调用 next() 继续处理链，类似 chain.doFilter()
 *
 * 【Hono 框架】
 * - Hono 是类似 Express.js 的轻量 Web 框架
 * - createMiddleware() 创建中间件函数
 * - c.set() 存储数据到请求上下文（类似 request.setAttribute()）
 * - c.get() 在后续处理中获取数据（类似 request.getAttribute()）
 *
 * 【认证流程】
 * 1. 检查 Authorization 头格式: "Bearer {JWT}"
 * 2. 验证 JWT 签名和有效期
 * 3. 从数据库查询会话和用户信息（一次JOIN查询优化性能）
 * 4. 验证会话未被撤销
 * 5. 验证用户状态为活跃
 * 6. 验证会话版本号匹配（支持批量撤销）
 * 7. 将认证信息存入上下文供后续使用
 *
 * 【性能优化】
 * - 使用 JOIN 查询一次获取会话和用户信息，减少数据库往返
 * - 添加性能日志，便于排查慢请求
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { authSessions, users } from "../db/index.js";
import { db } from "../db/client.js";
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
 * 会话缓存
 * 用于缓存已验证的会话信息，减少数据库查询
 */
type CachedSession = {
  session: typeof authSessions.$inferSelect;
  user: typeof users.$inferSelect;
  cachedAt: number; // 缓存时间戳
};

const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL = 60000; // 缓存有效期：60秒

/**
 * 清理过期的缓存条目
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of sessionCache.entries()) {
    if (now - value.cachedAt > CACHE_TTL) {
      sessionCache.delete(key);
    }
  }
}

// 每分钟清理一次过期缓存
setInterval(cleanExpiredCache, 60000);

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
  const authStartTime = Date.now();

  // 添加调用栈信息，帮助调试
  const path = c.req.path;
  const method = c.req.method;
  console.log(`[AUTH] 开始验证 ${method} ${path}`);

  // 1. 检查 Authorization 头
  const header = c.req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return errorResponse(c, 401, "AUTH_REQUIRED", "Authorization required");
  }

  try {
    // 2. 提取并验证 JWT 令牌
    let t1 = Date.now();
    const token = header.replace("Bearer ", "");
    const payload = await verifyAccessToken(token);
    const sessionId = payload.sessionId;
    const userId = payload.sub;
    console.log(`[AUTH] JWT验证耗时: ${Date.now() - t1}ms`);

    // 检查payload是否包含必需字段
    if (!sessionId || !userId) {
      return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
    }

    // 3. 尝试从缓存获取会话信息
    t1 = Date.now();
    const cached = sessionCache.get(sessionId);
    const now = Date.now();

    let session: typeof authSessions.$inferSelect;
    let user: typeof users.$inferSelect;

    if (cached && (now - cached.cachedAt < CACHE_TTL)) {
      // 缓存命中且未过期
      session = cached.session;
      user = cached.user;
      console.log(`[AUTH] [Cache] 缓存命中耗时: ${Date.now() - t1}ms`);
    } else {
      // 缓存未命中或已过期，查询数据库
      const result = await db
        .select({
          session: authSessions,
          user: users,
        })
        .from(authSessions)
        .innerJoin(users, eq(authSessions.userId, users.userId))
        .where(eq(authSessions.sessionId, sessionId))
        .limit(1);
      console.log(`[AUTH] [DB] 查询会话+用户耗时: ${Date.now() - t1}ms`);

      if (result.length === 0) {
        return errorResponse(c, 401, "SESSION_REVOKED", "Session not found");
      }

      session = result[0].session;
      user = result[0].user;

      // 更新缓存
      sessionCache.set(sessionId, { session, user, cachedAt: now });
      console.log(`[AUTH] [Cache] 缓存已更新，当前缓存大小: ${sessionCache.size}`);
    }

    // 4. 检查会话是否被撤销
    if (session.revokedAt) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 5. 检查用户是否存在且状态为活跃
    if (!user || user.status !== "active") {
      return errorResponse(c, 401, "USER_INACTIVE", "User inactive");
    }

    // 6. 检查会话版本号是否匹配（批量撤销机制）
    if (user.sessionVersion !== payload.sessionVersion) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 7. 将认证信息存入上下文
    c.set("auth", {
      userId,
      sessionId,
      sessionVersion: payload.sessionVersion
    } satisfies AuthContext);

    console.log(`[AUTH] 总耗时: ${Date.now() - authStartTime}ms`);

    // 继续处理请求
    return next();
  } catch (error) {
    // JWT验证失败（签名错误、过期等）
    return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
  }
});

/**
 * 清除指定会话的缓存
 * 在登出或撤销会话时调用
 */
export function clearSessionCache(sessionId: string) {
  sessionCache.delete(sessionId);
  console.log(`[AUTH] [Cache] 已清除会话缓存: ${sessionId}`);
}

/**
 * 清除所有会话缓存
 * 在批量撤销或维护时调用
 */
export function clearAllSessionCache() {
  sessionCache.clear();
  console.log(`[AUTH] [Cache] 已清除所有会话缓存`);
}
