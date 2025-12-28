/**
 * 认证路由模块
 *
 * 【Java 对比 - 类似 Spring Security Controller】
 *
 * 本文件等同于 Spring 的认证控制器：
 * ```java
 * @RestController
 * @RequestMapping("/api/v1/auth")
 * public class AuthController {
 *     @Autowired
 *     private AuthenticationManager authenticationManager;
 *
 *     @PostMapping("/password/register")
 *     public ResponseEntity<?> register(@RequestBody RegisterDto dto) { ... }
 *
 *     @PostMapping("/password/login")
 *     public ResponseEntity<?> login(@RequestBody LoginDto dto) { ... }
 *
 *     @PostMapping("/refresh")
 *     public ResponseEntity<?> refresh(@RequestBody RefreshDto dto) { ... }
 * }
 * ```
 *
 * 【Hono 路由】
 * - Hono 路由类似 Express.js 的路由器
 * - 创建子路由器，挂载到主应用的 /api/v1/auth
 * - 每个路由处理器是一个异步函数
 *
 * 【Zod 验证库】
 * - Zod 是 TypeScript 的运行时验证库
 * - 类似 Java 的 Bean Validation (@Valid, @NotNull, @Size)
 * - 提供类型安全的验证和自动类型推断
 *
 * 【路由列表】
 * 1. POST /password/register - 用户注册（公开）
 * 2. POST /password/login - 用户登录（公开）
 * 3. POST /refresh - 刷新令牌（公开）
 * 4. POST /logout - 登出当前会话（需认证）
 * 5. POST /logout-all - 登出所有会话（需认证）
 * 6. GET /me - 获取当前用户信息（需认证）
 *
 * 【双令牌机制】
 * - Access Token: 短期（15分钟），用于日常API请求
 * - Refresh Token: 长期（30天），仅用于刷新 Access Token
 * - Refresh Token 哈希后存储在数据库，提高安全性
 */

import { Hono } from "hono";
import { z } from "zod"; // Zod 验证库，类似 Java Bean Validation
import crypto from "node:crypto"; // Node.js 内置加密模块，生成随机 UUID
import { and, eq, isNull, sql } from "drizzle-orm"; // Drizzle ORM 查询构建器
import { authSessions, users } from "@reimbursement/shared/db";
import { db } from "../db/client";
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyRefreshToken,
} from "../services/auth";
import { config } from "../config";
import { authMiddleware, clearSessionCache, clearAllSessionCache } from "../middleware/auth";
import { errorResponse, ok } from "../utils/http";

/**
 * 创建 Hono 子路由器
 *
 * 【Java 对比】类似创建 @RestController 实例
 * - Hono() 创建一个新的路由器
 * - 这个路由器会被 index.ts 挂载到 /api/v1/auth
 */
const router = new Hono();

/**
 * 注册请求验证规则
 *
 * 【Zod 验证】类似 Java Bean Validation：
 * ```java
 * public class RegisterDto {
 *     @NotBlank
 *     @Size(min = 3)
 *     private String emailOrPhone;
 *
 *     @NotBlank
 *     @Size(min = 8)
 *     private String password;
 * }
 * ```
 *
 * 【z.object()】定义对象结构
 * - z.string() - 必须是字符串
 * - .min(3) - 最小长度 3
 */
const registerSchema = z.object({
  email_or_phone: z.string().min(3),
  password: z.string().min(8),
});

/**
 * 登录请求验证规则
 *
 * 【重用验证规则】登录和注册的字段相同，直接复用
 * 类似 Java 中复用同一个 DTO 类
 */
const loginSchema = registerSchema;

/**
 * 刷新令牌请求验证规则
 *
 * 【验证规则】
 * - refresh_token: 最小长度 10 的字符串
 */
const refreshSchema = z.object({
  refresh_token: z.string().min(10),
});

/**
 * POST /password/register - 用户注册
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/password/register")
 * public ResponseEntity<?> register(@Valid @RequestBody RegisterDto dto) {
 *     if (userRepository.existsByEmail(dto.getEmailOrPhone())) {
 *         throw new ConflictException("User already exists");
 *     }
 *     User user = new User();
 *     user.setEmailOrPhone(dto.getEmailOrPhone());
 *     user.setPasswordHash(passwordEncoder.encode(dto.getPassword()));
 *     userRepository.save(user);
 *     return ResponseEntity.ok(createSession(user));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体（Zod 验证）
 * 2. 检查用户是否已存在
 * 3. 加密密码（bcrypt）
 * 4. 插入用户到数据库
 * 5. 创建会话并返回令牌
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 409 USER_EXISTS: 用户已存在
 *
 * @param c - Hono 上下文，类似 HttpServletRequest + HttpServletResponse
 */
router.post("/password/register", async (c) => {
  // 1. 验证请求体
  // safeParse() 不会抛出异常，而是返回 { success: boolean, data?: T }
  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 2. 解构提取字段（类似 Java 的 getter）
  const { email_or_phone, password } = body.data;

  // 3. 检查用户是否已存在
  // 【Drizzle 查询】类似 JPA: userRepository.findByEmailOrPhone(email)
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.emailOrPhone, email_or_phone));

  if (existing.length > 0) {
    return errorResponse(c, 409, "USER_EXISTS", "User already exists");
  }

  // 4. 加密密码（bcrypt）
  const passwordHash = await hashPassword(password);

  // 5. 插入用户到数据库
  // 【Drizzle 插入】类似 JPA: userRepository.save(user)
  // .returning() - 返回插入的记录（PostgreSQL 特性）
  const [user] = await db
    .insert(users)
    .values({
      emailOrPhone: email_or_phone,
      passwordHash,
    })
    .returning();

  // 6. 创建会话（生成令牌）
  const auth = await createSession(user.userId, c);

  // 7. 返回用户信息和令牌
  // sanitizeUser() - 移除密码哈希，防止泄露
  return ok(c, { user: sanitizeUser(user), tokens: auth });
});

/**
 * POST /password/login - 用户登录
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/password/login")
 * public ResponseEntity<?> login(@Valid @RequestBody LoginDto dto) {
 *     User user = userRepository.findByEmail(dto.getEmailOrPhone())
 *         .orElseThrow(() -> new UnauthorizedException("Invalid credentials"));
 *
 *     if (!passwordEncoder.matches(dto.getPassword(), user.getPasswordHash())) {
 *         throw new UnauthorizedException("Invalid credentials");
 *     }
 *
 *     return ResponseEntity.ok(createSession(user));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 根据邮箱/手机号查询用户
 * 3. 验证密码
 * 4. 创建会话并返回令牌
 *
 * 【安全设计】
 * - 用户不存在和密码错误返回相同错误（防止用户枚举攻击）
 * - 错误消息模糊："Invalid credentials"
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 401 AUTH_INVALID_CREDENTIALS: 用户不存在或密码错误
 */
router.post("/password/login", async (c) => {
  // 1. 验证请求体
  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const { email_or_phone, password } = body.data;

  // 2. 查询用户
  // 【数组解构】const [user] - 取第一个元素
  // 如果没有找到，user 为 undefined
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.emailOrPhone, email_or_phone));

  // 3. 检查用户是否存在
  if (!user || !user.passwordHash) {
    return errorResponse(
      c,
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid credentials"
    );
  }

  // 4. 验证密码
  // verifyPassword() - 使用 bcrypt.compare() 比较密码
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return errorResponse(
      c,
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid credentials"
    );
  }

  // 5. 创建会话并返回令牌
  const auth = await createSession(user.userId, c);
  return ok(c, { user: sanitizeUser(user), tokens: auth });
});

/**
 * POST /refresh - 刷新访问令牌
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/refresh")
 * public ResponseEntity<?> refresh(@Valid @RequestBody RefreshDto dto) {
 *     JwtPayload payload = jwtService.verifyRefreshToken(dto.getRefreshToken());
 *
 *     Session session = sessionRepository.findById(payload.getSessionId())
 *         .orElseThrow(() -> new UnauthorizedException("Session revoked"));
 *
 *     if (session.getRevokedAt() != null) {
 *         throw new UnauthorizedException("Session revoked");
 *     }
 *
 *     if (!session.getRefreshTokenHash().equals(hashToken(dto.getRefreshToken()))) {
 *         throw new UnauthorizedException("Session revoked");
 *     }
 *
 *     // 生成新令牌对
 *     Tokens tokens = issueTokens(session);
 *     session.setRefreshTokenHash(hashToken(tokens.getRefreshToken()));
 *     sessionRepository.save(session);
 *
 *     return ResponseEntity.ok(tokens);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 验证 Refresh Token 签名和有效期
 * 3. 从数据库查询会话信息
 * 4. 验证会话未被撤销
 * 5. 验证 Refresh Token 哈希匹配（防止令牌重放攻击）
 * 6. 验证会话未过期
 * 7. 查询用户信息
 * 8. 生成新的令牌对（Access + Refresh）
 * 9. 更新会话的 Refresh Token 哈希
 * 10. 返回新令牌
 *
 * 【安全设计】
 * - Refresh Token 哈希存储，防止数据库泄露后被滥用
 * - 每次刷新生成新的 Refresh Token（Refresh Token 轮换）
 * - 旧的 Refresh Token 失效，防止重放攻击
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 401 TOKEN_INVALID: Refresh Token 签名错误或已过期
 * - 401 SESSION_REVOKED: 会话已被撤销或令牌哈希不匹配
 * - 401 TOKEN_EXPIRED: Refresh Token 已过期
 */
router.post("/refresh", async (c) => {
  const body = refreshSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  try {
    // 1. 验证 Refresh Token（JWT 签名 + 过期时间）
    const payload = await verifyRefreshToken(body.data.refresh_token);

    // 2. 查询会话信息
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.sessionId, payload.sessionId));

    // 3. 验证会话存在且未被撤销
    if (!session || session.revokedAt) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 4. 验证 Refresh Token 哈希匹配（防止令牌被篡改或重放）
    if (session.refreshTokenHash !== hashToken(body.data.refresh_token)) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 5. 验证会话未过期
    if (session.expiresAt < new Date()) {
      return errorResponse(c, 401, "TOKEN_EXPIRED", "Refresh token expired");
    }

    // 6. 查询用户信息
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.userId, payload.sub));
    if (!user) {
      return errorResponse(c, 401, "SESSION_REVOKED", "Session revoked");
    }

    // 7. 生成新的令牌对（Access Token + Refresh Token）
    const tokens = await issueTokens(
      payload.sub,
      payload.sessionId,
      user.sessionVersion
    );

    // 8. 更新会话的 Refresh Token 哈希和最后活跃时间
    // 【Refresh Token 轮换】每次刷新都生成新的 Refresh Token
    await db
      .update(authSessions)
      .set({
        refreshTokenHash: hashToken(tokens.refresh_token),
        lastSeenAt: new Date(),
      })
      .where(eq(authSessions.sessionId, payload.sessionId));

    return ok(c, { tokens });
  } catch (error) {
    // JWT 验证失败（签名错误、过期等）
    return errorResponse(c, 401, "TOKEN_INVALID", "Invalid token");
  }
});

/**
 * POST /logout - 登出当前会话
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/logout")
 * @PreAuthorize("isAuthenticated()")
 * public ResponseEntity<?> logout(Authentication auth) {
 *     String sessionId = ((JwtPayload) auth.getPrincipal()).getSessionId();
 *     sessionRepository.revokeSession(sessionId);
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 从认证上下文获取 sessionId（authMiddleware 已验证）
 * 2. 标记会话为已撤销（设置 revokedAt 时间戳）
 * 3. 清除该会话的缓存
 * 4. 返回成功响应
 *
 * 【认证要求】
 * - 需要 authMiddleware 验证（只有已登录用户才能登出）
 *
 * 【注意】
 * - 只撤销当前会话，用户的其他设备/浏览器仍然保持登录
 * - 如果需要登出所有设备，使用 /logout-all
 */
router.post("/logout", authMiddleware, async (c) => {
  // 1. 从上下文获取 sessionId（由 authMiddleware 设置）
  const { sessionId } = c.get("auth");

  // 2. 标记会话为已撤销
  // 【软删除】设置 revokedAt 而不是物理删除，保留审计记录
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.sessionId, sessionId));

  // 3. 清除缓存（避免缓存的会话继续有效）
  clearSessionCache(sessionId);

  return ok(c, { success: true });
});

/**
 * POST /logout-all - 登出所有会话（批量撤销）
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/logout-all")
 * @PreAuthorize("isAuthenticated()")
 * public ResponseEntity<?> logoutAll(Authentication auth) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 增加会话版本号（使所有旧令牌失效）
 *     User user = userRepository.findById(userId).orElseThrow();
 *     user.setSessionVersion(user.getSessionVersion() + 1);
 *     userRepository.save(user);
 *
 *     // 撤销所有会话
 *     sessionRepository.revokeAllSessions(userId);
 *
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 从认证上下文获取 userId
 * 2. 增加用户的会话版本号（sessionVersion + 1）
 * 3. 撤销用户的所有会话
 * 4. 清除所有会话缓存
 * 5. 返回成功响应
 *
 * 【会话版本机制】
 * - sessionVersion 存储在 users 表中
 * - JWT 令牌包含 sessionVersion
 * - authMiddleware 验证令牌中的 sessionVersion 是否匹配
 * - 当 sessionVersion 增加时，所有旧令牌立即失效（无需逐个撤销）
 *
 * 【使用场景】
 * - 用户更改密码后，登出所有设备
 * - 用户怀疑账号被盗，强制登出所有设备
 * - 管理员操作：封禁用户，撤销所有会话
 *
 * 【SQL 自增操作】
 * - sql`${users.sessionVersion} + 1` - 使用 SQL 表达式原子性自增
 * - 避免竞态条件（读取-修改-写入）
 */
router.post("/logout-all", authMiddleware, async (c) => {
  const { userId } = c.get("auth");

  // 1. 增加会话版本号（使所有旧令牌失效）
  // 【Drizzle SQL 表达式】类似 JPA: @Query("UPDATE users SET sessionVersion = sessionVersion + 1")
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.userId, userId));

  // 2. 撤销所有未撤销的会话
  // 【条件组合】and() 组合多个条件，类似 SQL: WHERE userId = ? AND revokedAt IS NULL
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt))
    );

  // 3. 清除所有会话缓存（批量撤销会影响所有会话）
  clearAllSessionCache();

  return ok(c, { success: true });
});

/**
 * GET /me - 获取当前登录用户信息
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/me")
 * @PreAuthorize("isAuthenticated()")
 * public ResponseEntity<?> getCurrentUser(Authentication auth) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *     User user = userRepository.findById(userId)
 *         .orElseThrow(() -> new NotFoundException("User not found"));
 *     return ResponseEntity.ok(sanitizeUser(user));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 从认证上下文获取 userId
 * 2. 查询用户信息
 * 3. 返回清理后的用户信息（移除密码哈希）
 *
 * 【认证要求】
 * - 需要 authMiddleware 验证
 *
 * 【错误响应】
 * - 404 USER_NOT_FOUND: 用户不存在（理论上不应该发生）
 */
router.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");

  // 查询用户信息
  const [user] = await db.select().from(users).where(eq(users.userId, userId));
  if (!user) {
    return errorResponse(c, 404, "USER_NOT_FOUND", "User not found");
  }

  // 返回清理后的用户信息（移除敏感字段）
  return ok(c, { user: sanitizeUser(user) });
});

/**
 * 创建会话（辅助函数）
 *
 * 【Java 对比】类似 Service 方法：
 * ```java
 * private Tokens createSession(String userId, HttpServletRequest request) {
 *     User user = userRepository.findById(userId).orElseThrow();
 *     String sessionId = UUID.randomUUID().toString();
 *
 *     Tokens tokens = issueTokens(userId, sessionId, user.getSessionVersion());
 *
 *     Session session = new Session();
 *     session.setSessionId(sessionId);
 *     session.setUserId(userId);
 *     session.setRefreshTokenHash(hashToken(tokens.getRefreshToken()));
 *     session.setExpiresAt(new Date(System.currentTimeMillis() + refreshTtl));
 *     session.setUserAgent(request.getHeader("User-Agent"));
 *     session.setIp(request.getHeader("X-Forwarded-For"));
 *     sessionRepository.save(session);
 *
 *     return tokens;
 * }
 * ```
 *
 * 【功能】
 * 1. 查询用户信息（获取 sessionVersion）
 * 2. 生成随机会话 ID（UUID）
 * 3. 生成令牌对（Access Token + Refresh Token）
 * 4. 计算会话过期时间
 * 5. 插入会话记录到数据库
 * 6. 返回令牌
 *
 * 【会话信息】
 * - sessionId: 随机 UUID，唯一标识会话
 * - userId: 关联用户
 * - refreshTokenHash: Refresh Token 的哈希（安全存储）
 * - expiresAt: 会话过期时间（基于 Refresh Token 有效期）
 * - userAgent: 浏览器 User-Agent（审计用途）
 * - ip: 客户端 IP 地址（审计用途）
 *
 * @param userId - 用户 ID
 * @param c - Hono 上下文（用于获取请求头）
 * @returns 令牌对象 { access_token, refresh_token, expires_in }
 */
async function createSession(
  userId: string,
  c: { req: { header: (name: string) => string | undefined } }
) {
  // 1. 查询用户（获取 sessionVersion）
  const [user] = await db.select().from(users).where(eq(users.userId, userId));
  if (!user) {
    throw new Error("User not found");
  }

  // 2. 生成随机会话 ID
  // crypto.randomUUID() - Node.js 内置方法，生成符合 RFC 4122 的 UUID v4
  const sessionId = crypto.randomUUID();

  // 3. 生成令牌对
  const tokens = await issueTokens(userId, sessionId, user.sessionVersion);

  // 4. 计算会话过期时间（基于 Refresh Token 有效期）
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.jwtRefreshTtlSeconds * 1000
  );

  // 5. 插入会话记录
  await db.insert(authSessions).values({
    sessionId,
    userId,
    refreshTokenHash: hashToken(tokens.refresh_token), // 哈希存储，防止泄露
    expiresAt,
    userAgent: c.req.header("user-agent"), // 记录浏览器信息（审计）
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"), // 记录 IP（审计）
  });

  return tokens;
}

/**
 * 生成访问令牌和刷新令牌（辅助函数）
 *
 * 【Java 对比】类似：
 * ```java
 * private Tokens issueTokens(String userId, String sessionId, int sessionVersion) {
 *     Map<String, Object> claims = Map.of(
 *         "sub", userId,
 *         "sessionId", sessionId,
 *         "sessionVersion", sessionVersion
 *     );
 *
 *     String accessToken = jwtService.createAccessToken(claims);
 *     String refreshToken = jwtService.createRefreshToken(claims);
 *
 *     return new Tokens(accessToken, refreshToken, accessTtl);
 * }
 * ```
 *
 * 【功能】
 * 1. 创建 Access Token（短期，15分钟）
 * 2. 创建 Refresh Token（长期，30天）
 * 3. 返回令牌对象
 *
 * 【JWT Claims（声明）】
 * - sub: 主体（Subject），通常是用户 ID
 * - sessionId: 会话 ID，标识这个登录会话
 * - sessionVersion: 会话版本号，用于批量撤销
 *
 * @param userId - 用户 ID
 * @param sessionId - 会话 ID
 * @param sessionVersion - 会话版本号
 * @returns 令牌对象 { access_token, refresh_token, expires_in }
 */
async function issueTokens(
  userId: string,
  sessionId: string,
  sessionVersion: number
) {
  // 1. 创建 Access Token（短期，用于日常 API 请求）
  const accessToken = await createAccessToken({
    sub: userId,
    sessionId,
    sessionVersion,
  });

  // 2. 创建 Refresh Token（长期，仅用于刷新 Access Token）
  const refreshToken = await createRefreshToken({
    sub: userId,
    sessionId,
    sessionVersion,
  });

  // 3. 返回令牌对象
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: config.jwtAccessTtlSeconds, // Access Token 有效期（秒）
  };
}

/**
 * 清理用户对象（移除敏感字段）
 *
 * 【Java 对比】类似 DTO 转换：
 * ```java
 * private UserDto sanitizeUser(User user) {
 *     UserDto dto = new UserDto();
 *     dto.setUserId(user.getUserId());
 *     dto.setEmailOrPhone(user.getEmailOrPhone());
 *     // 不设置 passwordHash
 *     return dto;
 * }
 * ```
 *
 * 【对象解构 + 剩余运算符】
 * ```typescript
 * const { passwordHash, ...rest } = user;
 * ```
 * - 提取 passwordHash 字段
 * - ...rest 收集剩余的所有字段
 * - 返回 rest，不包含 passwordHash
 *
 * 【为什么需要？】
 * - 防止将密码哈希返回给客户端（安全风险）
 * - 即使是哈希值，也不应该暴露（可能被离线破解）
 *
 * @param user - 完整的用户对象
 * @returns 清理后的用户对象（不包含 passwordHash）
 */
function sanitizeUser(user: typeof users.$inferSelect) {
  // 【对象解构】提取 passwordHash，剩余字段放入 rest
  const { passwordHash, ...rest } = user;
  return rest; // 返回不包含 passwordHash 的对象
}

/**
 * 导出路由器
 *
 * 【模块导出】export default - 默认导出
 * - 导入时可以任意命名：import authRoutes from "./routes/auth"
 * - 类似 Java 的 public class（文件名即类名）
 */
export default router;
