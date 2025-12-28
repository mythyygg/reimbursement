/**
 * 认证服务模块
 *
 * 【Java 对比 - 类似 Spring Security 的认证工具类】
 *
 * 本模块提供完整的身份验证和授权功能，类似于：
 * ```java
 * @Service
 * public class AuthenticationService {
 *     public String hashPassword(String password) { ... }
 *     public boolean verifyPassword(String password, String hash) { ... }
 *     public String createAccessToken(TokenPayload payload) { ... }
 *     public TokenPayload verifyAccessToken(String token) { ... }
 * }
 * ```
 *
 * 核心功能：
 * 1. 【密码管理】
 *    - hashPassword() - 使用 bcrypt 加密密码（类似 BCryptPasswordEncoder）
 *    - verifyPassword() - 验证密码（类似 passwordEncoder.matches()）
 *
 * 2. 【JWT 令牌管理】
 *    - createAccessToken() - 生成短期访问令牌（15分钟）
 *    - createRefreshToken() - 生成长期刷新令牌（30天）
 *    - verifyAccessToken() - 验证访问令牌
 *    - verifyRefreshToken() - 验证刷新令牌
 *
 * 3. 【令牌安全存储】
 *    - hashToken() - 对刷新令牌哈希后存储到数据库
 *
 * 【技术栈】
 * - bcryptjs: 密码加密库（类似 Spring Security 的 BCryptPasswordEncoder）
 * - jose: JWT 生成和验证库（类似 jjwt 或 auth0/java-jwt）
 * - crypto: Node.js 内置加密模块（类似 java.security.MessageDigest）
 *
 * 【双令牌机制】
 * - Access Token: 短期有效（15分钟），用于日常API请求
 * - Refresh Token: 长期有效（30天），仅用于刷新 Access Token
 *
 * 这种设计提高了安全性：
 * - Access Token 泄露影响有限（15分钟后自动失效）
 * - Refresh Token 存储在数据库中，可以主动撤销
 */

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";

// 文本编码器，用于将字符串转换为 Uint8Array（JWT库要求）
// 【说明】jose 库要求密钥为 Uint8Array 格式，而不是字符串
const encoder = new TextEncoder();

/**
 * JWT令牌载荷类型
 *
 * 【Java 对比】类似自定义的 JWT Claims 类：
 * ```java
 * public class TokenPayload {
 *     private String sub;           // 用户ID (Subject)
 *     private String sessionId;     // 会话ID
 *     private int sessionVersion;   // 会话版本
 * }
 * ```
 *
 * 【JWT 标准字段说明】
 * - sub: Subject（主题），通常存储用户唯一标识符
 * - 其他标准字段（由库自动添加）：
 *   - iat: Issued At（签发时间）
 *   - exp: Expiration Time（过期时间）
 */
export type TokenPayload = {
  /** 用户ID（标准JWT sub字段） */
  sub: string;
  /** 会话ID - 用于标识特定的登录会话，支持单独撤销某个设备的登录 */
  sessionId: string;
  /** 会话版本号 - 用于批量撤销，修改版本号后所有旧令牌失效 */
  sessionVersion: number;
};

/**
 * 对密码进行哈希加密
 *
 * @param value - 明文密码
 * @returns Promise<加密后的密码哈希>
 *
 * @description
 * 使用 bcrypt 算法对密码加密：
 * - 自动生成盐值（salt）
 * - 成本因子为 10（2^10 = 1024次迭代）
 * - 单向加密，无法反向解密
 *
 * @example
 * const hash = await hashPassword('mySecretPassword123')
 * // 返回类似: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldd...
 */
export async function hashPassword(value: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}

/**
 * 验证密码是否匹配
 *
 * @param value - 用户输入的明文密码
 * @param hash - 数据库中存储的密码哈希
 * @returns Promise<true表示匹配，false表示不匹配>
 *
 * @description
 * 使用 bcrypt.compare 安全地比较密码，自动处理盐值
 *
 * @example
 * const isValid = await verifyPassword('userInput', storedHash)
 * if (isValid) {
 *   // 密码正确，允许登录
 * }
 */
export async function verifyPassword(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

/**
 * 创建访问令牌（Access Token）
 *
 * @param payload - 令牌载荷，包含用户ID、会话ID和版本号
 * @returns Promise<JWT访问令牌字符串>
 *
 * @description
 * 访问令牌用于日常API请求的身份验证：
 * - 使用 HS256 算法签名
 * - 有效期较短（默认15分钟）
 * - 包含用户身份和会话信息
 *
 * @example
 * const accessToken = await createAccessToken({
 *   sub: 'user-123',
 *   sessionId: 'session-456',
 *   sessionVersion: 1
 * })
 * // 前端将此token添加到请求头: Authorization: Bearer {accessToken}
 */
export async function createAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtAccessTtlSeconds}s`)
    .sign(encoder.encode(config.jwtAccessSecret));
}

/**
 * 创建刷新令牌（Refresh Token）
 *
 * @param payload - 令牌载荷，包含用户ID、会话ID和版本号
 * @returns Promise<JWT刷新令牌字符串>
 *
 * @description
 * 刷新令牌用于获取新的访问令牌：
 * - 使用 HS256 算法签名
 * - 有效期较长（默认30天）
 * - 存储在数据库中（哈希后），可以被主动撤销
 * - 不用于日常API请求，仅用于刷新访问令牌
 *
 * @example
 * const refreshToken = await createRefreshToken({
 *   sub: 'user-123',
 *   sessionId: 'session-456',
 *   sessionVersion: 1
 * })
 * // 前端保存到安全存储，在访问令牌过期时用于刷新
 */
export async function createRefreshToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtRefreshTtlSeconds}s`)
    .sign(encoder.encode(config.jwtRefreshSecret));
}

/**
 * 验证访问令牌
 *
 * @param token - JWT访问令牌字符串
 * @returns Promise<令牌载荷>
 * @throws {Error} 令牌无效、过期或签名错误时抛出异常
 *
 * @description
 * 验证访问令牌的签名和过期时间，解析出载荷数据
 *
 * @example
 * try {
 *   const payload = await verifyAccessToken(token)
 *   console.log('用户ID:', payload.sub)
 * } catch (error) {
 *   console.error('令牌无效')
 * }
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(config.jwtAccessSecret));
  return payload as TokenPayload;
}

/**
 * 验证刷新令牌
 *
 * @param token - JWT刷新令牌字符串
 * @returns Promise<令牌载荷>
 * @throws {Error} 令牌无效、过期或签名错误时抛出异常
 *
 * @description
 * 验证刷新令牌的签名和过期时间，解析出载荷数据
 *
 * @example
 * try {
 *   const payload = await verifyRefreshToken(refreshToken)
 *   // 生成新的访问令牌
 *   const newAccessToken = await createAccessToken(payload)
 * } catch (error) {
 *   console.error('刷新令牌无效，需要重新登录')
 * }
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(config.jwtRefreshSecret));
  return payload as TokenPayload;
}

/**
 * 对令牌进行哈希
 *
 * @param value - 原始令牌字符串
 * @returns 令牌的SHA256哈希值（十六进制字符串）
 *
 * @description
 * 用于在数据库中存储令牌的哈希值而非明文：
 * - 使用 SHA256 算法
 * - 单向加密，无法反向获取原始令牌
 * - 提高安全性，即使数据库泄露也无法直接使用
 *
 * @example
 * const refreshToken = 'eyJhbGciOiJIUzI1NiIs...'
 * const tokenHash = hashToken(refreshToken)
 * // 将 tokenHash 存入数据库而非明文 refreshToken
 */
export function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
