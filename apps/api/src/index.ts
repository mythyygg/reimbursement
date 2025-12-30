/**
 * API 应用入口
 *
 * 【Java 对比 - 类似 Spring Boot 主应用类】
 *
 * 本文件等同于 Spring Boot 的 @SpringBootApplication 类：
 * ```java
 * @SpringBootApplication
 * @EnableWebMvc
 * public class ApiApplication {
 *     public static void main(String[] args) {
 *         SpringApplication.run(ApiApplication.class, args);
 *     }
 *
 *     // 配置 CORS
 *     @Bean
 *     public FilterRegistrationBean<CorsFilter> corsFilter() { ... }
 *
 *     // 配置全局异常处理
 *     @ControllerAdvice
 *     public class GlobalExceptionHandler { ... }
 * }
 * ```
 *
 * 【Hono 框架介绍】
 * - Hono 是现代化的轻量级 Web 框架
 * - 类似 Express.js，但性能更好（比 Express 快 3-4 倍）
 * - 支持多种运行时：Node.js, Cloudflare Workers, Deno
 * - API 设计简洁，类型安全
 *
 * 【应用架构】
 * 本应用采用洋葱模型（Middleware 套 Middleware）：
 *
 *  请求 → CORS → Timing → Auth → Route Handler → 响应
 *    ↓      ↓       ↓       ↓         ↓
 *  允许   记录    验证    处理      返回
 *  跨域   时间    JWT     业务      JSON
 *
 * 【路由组织】
 * 1. 公开路由（无需认证）：
 *    - /health - 健康检查
 *    - /api/v1/auth/* - 认证相关（登录、注册、刷新令牌）
 *
 * 2. 受保护路由（需要认证）：
 *    - /api/v1/projects - 项目管理
 *    - /api/v1/expenses - 费用管理
 *    - /api/v1/receipts - 票据管理
 *    - /api/v1/batches - 批次管理
 *    - /api/v1/exports - 导出管理
 */

import "./types.js";  // 【重要】扩展 Hono 上下文类型，添加自定义变量类型
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { timingMiddleware } from "./middleware/timing.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { securityHeadersMiddleware, applySecurityHeaders } from "./middleware/security-headers.js";
import { authMiddleware } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import expenseRoutes from "./routes/expenses.js";
import receiptRoutes from "./routes/receipts.js";
import batchRoutes from "./routes/batches.js";
import exportRoutes from "./routes/exports.js";
import { logError } from "./utils/logger.js";

// 创建 Hono 应用实例
// 【Java 对比】类似：SpringApplication app = new SpringApplication(ApiApplication.class);
const app = new Hono();

/**
 * 全局中间件 #1：请求ID
 */
app.use("*", requestIdMiddleware);

/**
 * 全局中间件 #2：安全响应头
 */
app.use("*", securityHeadersMiddleware);

/**
 * 全局中间件 #3：CORS（跨域资源共享）
 *
 * 【Java 对比】类似 Spring 的 CorsConfiguration：
 * ```java
 * @Bean
 * public CorsFilter corsFilter() {
 *     CorsConfiguration config = new CorsConfiguration();
 *     config.setAllowedOrigins(Arrays.asList("*"));
 *     config.setAllowedMethods(Arrays.asList("*"));
 *     return new CorsFilter(config);
 * }
 * ```
 *
 * 作用：允许前端（运行在不同域名/端口）访问后端 API
 * 例如：前端在 localhost:3001，后端在 localhost:8787
 */
const isProduction = process.env.NODE_ENV === "production";
const corsOptions = isProduction
  ? {
      origin: (origin: string | undefined) => {
        if (!origin) {
          return undefined;
        }
        return config.corsAllowedOrigins.includes(origin) ? origin : undefined;
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }
  : {
      origin: (origin: string | undefined) => origin ?? "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    };

app.use("*", cors(corsOptions));

/**
 * 全局中间件 #4：性能计时
 *
 * 【Java 对比】类似 Spring 的 HandlerInterceptor：
 * ```java
 * @Component
 * public class TimingInterceptor implements HandlerInterceptor {
 *     @Override
 *     public boolean preHandle(...) {
 *         request.setAttribute("startTime", System.currentTimeMillis());
 *         return true;
 *     }
 *     @Override
 *     public void afterCompletion(...) {
 *         long duration = System.currentTimeMillis() - startTime;
 *         log.info("Request took {}ms", duration);
 *     }
 * }
 * ```
 *
 * 作用：记录每个请求的处理时间，便于性能优化
 */
app.use("*", timingMiddleware);

/**
 * 全局错误处理器
 *
 * 【Java 对比】类似 @ControllerAdvice + @ExceptionHandler：
 * ```java
 * @ControllerAdvice
 * public class GlobalExceptionHandler {
 *     @ExceptionHandler(Exception.class)
 *     public ResponseEntity<ErrorResponse> handleException(Exception ex) {
 *         log.error("Unhandled error", ex);
 *         int status = (ex instanceof HttpException) ? ((HttpException) ex).getStatus() : 500;
 *         return ResponseEntity.status(status).body(
 *             new ErrorResponse("INTERNAL_ERROR", ex.getMessage())
 *         );
 *     }
 * }
 * ```
 *
 * 作用：
 * - 捕获所有未处理的异常
 * - 返回统一格式的错误响应
 * - 避免向客户端泄露敏感的堆栈信息
 */
app.onError((err, c) => {
  // 判断是否为 HTTP 异常（如 401, 404 等）
  const status = err instanceof HTTPException ? err.status : 500;

  // 记录错误日志（生产环境应使用日志服务）
  logError("request.error", err, {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status,
  });

  // 返回统一格式的错误响应
  applySecurityHeaders(c);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: err?.message ?? "Internal Server Error",
      },
    },
    status
  );
});

/**
 * 健康检查端点
 *
 * 【Java 对比】类似 Spring Boot Actuator 的 /actuator/health
 *
 * GET /health
 * Response: { "status": "ok" }
 *
 * 用途：
 * - 监控系统检查服务是否正常运行
 * - 负载均衡器健康检查
 * - Docker/Kubernetes 探活检查
 */
app.get("/health", (c) => c.json({ status: "ok" }));

/**
 * 公开路由：认证相关
 *
 * 【路由说明】
 * - /api/v1/auth/register - 用户注册
 * - /api/v1/auth/login - 用户登录
 * - /api/v1/auth/refresh - 刷新访问令牌
 *
 * 【为什么不需要认证？】
 * 用户还没有令牌，无法认证，所以登录/注册必须是公开的
 */
app.route("/api/v1/auth", authRoutes);

/**
 * 全局认证中间件
 *
 * 【Java 对比】类似 Spring Security 的 Filter Chain：
 * ```java
 * http.authorizeRequests()
 *     .antMatchers("/api/v1/auth/**").permitAll()
 *     .antMatchers("/api/v1/**").authenticated();
 * ```
 *
 * 作用：验证 JWT 令牌，确保用户已登录
 * 应用范围：/api/v1/* 除了 /api/v1/auth/*
 *
 * 【中间件执行顺序】
 * 1. 先执行 app.route("/api/v1/auth", authRoutes) - 不需要认证
 * 2. 再执行 app.use("/api/v1/*", authMiddleware) - /auth 已被排除
 * 3. 最后执行其他 /api/v1 路由 - 都需要认证
 */
app.use("/api/v1/*", authMiddleware);

/**
 * 受保护路由：业务 API
 *
 * 【注意】这些路由会先经过 authMiddleware 验证
 *
 * 路由说明：
 * - /api/v1/projects - 项目管理（CRUD）
 * - /api/v1/expenses - 费用管理
 * - /api/v1/receipts - 票据管理
 * - /api/v1/batches - 批次管理
 * - /api/v1/exports - 导出管理
 *
 * 【路由参数说明】
 * - projectRoutes 挂载到 /api/v1/projects
 *   - 路由内部定义 "/" → 实际路径 /api/v1/projects
 *   - 路由内部定义 "/:id" → 实际路径 /api/v1/projects/:id
 *
 * - expenseRoutes 挂载到 /api/v1
 *   - 路由内部定义 "/expenses" → 实际路径 /api/v1/expenses
 *   - 路由内部定义 "/expenses/:id" → 实际路径 /api/v1/expenses/:id
 */
app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1", expenseRoutes);
app.route("/api/v1", receiptRoutes);
app.route("/api/v1", batchRoutes);
app.route("/api/v1", exportRoutes);

/**
 * 404 处理器
 *
 * 【Java 对比】类似 Spring MVC 的 NoHandlerFoundException 处理：
 * ```java
 * @ExceptionHandler(NoHandlerFoundException.class)
 * public ResponseEntity<ErrorResponse> handle404(NoHandlerFoundException ex) {
 *     return ResponseEntity.status(404).body(
 *         new ErrorResponse("NOT_FOUND", "Not found")
 *     );
 * }
 * ```
 *
 * 作用：处理所有未匹配到的路由请求
 */
app.notFound((c) => {
  applySecurityHeaders(c);
  return c.json(
    { error: { code: "NOT_FOUND", message: "Not found" } },
    404
  );
});

/**
 * 导出应用实例
 *
 * 【Java 对比】类似 main 方法返回的 ApplicationContext
 *
 * 这个 app 实例会被 server.ts 导入并启动：
 * ```typescript
 * import app from "./index.js";
 * serve({ fetch: app.fetch, port: 8787 });
 * ```
 *
 * 【模块系统】
 * - export default：默认导出，导入时可以任意命名
 * - 类似 Java 的 public class（文件名即类名）
 */
export default app;
