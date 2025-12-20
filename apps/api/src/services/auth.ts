import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";

// 文本编码器，用于将字符串转换为 Uint8Array（JWT库要求）
const encoder = new TextEncoder();

/**
 * JWT令牌载荷类型
 */
export type TokenPayload = {
  /** 用户ID（标准JWT sub字段） */
  sub: string;
  /** 会话ID */
  sessionId: string;
  /** 会话版本号 - 用于批量撤销 */
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
