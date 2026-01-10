import type { AuthContext } from "./middleware/auth.js";

/**
 * Hono框架类型扩展
 *
 * @description
 * 扩展 Hono 框架的上下文变量映射，添加自定义的认证上下文。
 * 这样可以在所有路由处理器中通过 `c.get('auth')` 访问认证信息。
 *
 * @see {@link ../middleware/auth.ts} 认证中间件实现
 */
declare module "hono" {
  interface ContextVariableMap {
    /** 认证上下文 - 包含当前用户ID、会话ID等认证信息 */
    auth: AuthContext;
    /** 请求ID - 用于追踪日志 */
    requestId: string;
  }
}
