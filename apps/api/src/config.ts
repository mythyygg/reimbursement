/**
 * 时间单位类型
 * - s: 秒
 * - m: 分钟
 * - h: 小时
 * - d: 天
 */
export type DurationUnit = "s" | "m" | "h" | "d";

/**
 * 应用配置类型定义
 */
export type AppConfig = {
  /** JWT访问令牌密钥 - 用于签名和验证访问令牌 */
  jwtAccessSecret: string;
  /** JWT刷新令牌密钥 - 用于签名和验证刷新令牌 */
  jwtRefreshSecret: string;
  /** JWT访问令牌有效期（秒） - 默认15分钟(900秒) */
  jwtAccessTtlSeconds: number;
  /** JWT刷新令牌有效期（秒） - 默认30天(2592000秒) */
  jwtRefreshTtlSeconds: number;
  /** S3对象存储服务端点 - 如 https://s3.amazonaws.com 或兼容S3的服务地址 */
  s3Endpoint: string;
  /** S3区域 - 如 us-east-1 */
  s3Region: string;
  /** S3访问密钥ID */
  s3AccessKey: string;
  /** S3访问密钥密码 */
  s3SecretKey: string;
  /** S3存储桶名称 */
  s3Bucket: string;
  /** S3公开访问基础URL - 用于生成文件的公开访问地址 */
  s3PublicBaseUrl: string;
};

/**
 * 解析时间间隔字符串为秒数
 *
 * @param input - 时间间隔字符串，格式：数字+单位，如 "30s", "15m", "2h", "7d"
 * @returns 转换后的秒数
 *
 * @description
 * 支持的格式：
 * - 30s → 30秒
 * - 15m → 900秒（15分钟）
 * - 2h → 7200秒（2小时）
 * - 7d → 604800秒（7天）
 * - 纯数字 → 直接返回该数字
 *
 * @example
 * parseDuration("30s") // 30
 * parseDuration("15m") // 900
 * parseDuration("2h") // 7200
 * parseDuration("7d") // 604800
 * parseDuration("100") // 100
 */
function parseDuration(input: string): number {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) {
    // 如果不匹配格式，则当作纯数字处理
    return Number(input);
  }
  const value = Number(match[1]);
  const unit = match[2] as DurationUnit;
  // 时间单位到秒的转换映射
  const map: Record<DurationUnit, number> = {
    s: 1,        // 秒
    m: 60,       // 分钟
    h: 3600,     // 小时
    d: 86400     // 天
  };
  return value * map[unit];
}

/**
 * 获取环境变量，不存在时使用默认值或抛出错误
 *
 * @param name - 环境变量名称
 * @param fallback - 默认值（可选）
 * @returns 环境变量的值
 * @throws {Error} 当环境变量不存在且没有提供默认值时抛出错误
 *
 * @example
 * getEnv("DATABASE_URL") // 必需的环境变量
 * getEnv("PORT", "3000") // 可选的环境变量，默认值为 "3000"
 */
function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/**
 * 应用配置对象
 *
 * @description
 * 从环境变量中读取并构建应用配置。
 * 必需的环境变量会在启动时进行检查，缺失时会抛出错误。
 * 可选的环境变量提供了合理的默认值。
 *
 * 环境变量列表：
 * - JWT_ACCESS_SECRET: JWT访问令牌密钥（必需）
 * - JWT_REFRESH_SECRET: JWT刷新令牌密钥（必需）
 * - JWT_ACCESS_TTL: 访问令牌有效期，默认 "900"（15分钟）
 * - JWT_REFRESH_TTL: 刷新令牌有效期，默认 "2592000"（30天）
 * - S3_ENDPOINT: S3服务端点（必需）
 * - S3_REGION: S3区域，默认 "us-east-1"
 * - S3_ACCESS_KEY: S3访问密钥（必需）
 * - S3_SECRET_KEY: S3密钥密码（必需）
 * - S3_BUCKET: S3存储桶名称（必需）
 * - S3_PUBLIC_BASE_URL: S3公开URL基础路径，默认空字符串
 */
export const config: AppConfig = {
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  jwtAccessTtlSeconds: parseDuration(getEnv("JWT_ACCESS_TTL", "900")),
  jwtRefreshTtlSeconds: parseDuration(getEnv("JWT_REFRESH_TTL", "2592000")),
  s3Endpoint: getEnv("S3_ENDPOINT"),
  s3Region: getEnv("S3_REGION", "us-east-1"),
  s3AccessKey: getEnv("S3_ACCESS_KEY"),
  s3SecretKey: getEnv("S3_SECRET_KEY"),
  s3Bucket: getEnv("S3_BUCKET"),
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || ""
};
