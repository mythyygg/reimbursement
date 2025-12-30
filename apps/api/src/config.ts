/**
 * 时间单位类型
 *
 * 【Java 对比】类似枚举，但更灵活：
 * Java: enum DurationUnit { S, M, H, D }
 * TypeScript: 使用联合类型，编译时检查
 *
 * 支持的单位：
 * - "s": 秒（seconds）
 * - "m": 分钟（minutes）
 * - "h": 小时（hours）
 * - "d": 天（days）
 *
 * @example
 * const unit: DurationUnit = "m";  // ✅ 合法
 * const invalid: DurationUnit = "y";  // ❌ 编译错误
 */
export type DurationUnit = "s" | "m" | "h" | "d";

/**
 * 应用配置类型定义
 *
 * 【Java 对比】类似配置类，但使用 interface 而非 class：
 * Java:
 * ```java
 * @Configuration
 * public class AppConfig {
 *     private String jwtAccessSecret;
 *     private String jwtRefreshSecret;
 *     // ... getters/setters
 * }
 * ```
 *
 * TypeScript:
 * - interface 只定义数据结构，没有方法
 * - 类似 Java 的 DTO (Data Transfer Object)
 * - 运行时不存在，仅用于编译时类型检查
 *
 * 配置说明：
 * 本配置对象包含应用运行所需的所有环境变量配置
 * 类似 Spring Boot 的 application.yml 配置
 */
export type AppConfig = {
  /**
   * JWT访问令牌密钥 - 用于签名和验证访问令牌
   * 【安全性】类似 Spring Security 的 jwt.secret
   */
  jwtAccessSecret: string;

  /**
   * JWT刷新令牌密钥 - 用于签名和验证刷新令牌
   * 【最佳实践】与访问令牌使用不同的密钥，提高安全性
   */
  jwtRefreshSecret: string;

  /**
   * JWT访问令牌有效期（秒） - 默认15分钟(900秒)
   * 【Java 对比】类似 @Value("${jwt.access.ttl}") private Integer ttl;
   */
  jwtAccessTtlSeconds: number;

  /**
   * JWT刷新令牌有效期（秒） - 默认30天(2592000秒)
   * 【说明】刷新令牌有效期更长，用于无感刷新访问令牌
   */
  jwtRefreshTtlSeconds: number;

  /**
   * S3对象存储服务端点 - 如 https://s3.amazonaws.com 或兼容S3的服务地址
   * 【说明】本项目使用 Cloudflare R2（S3 兼容服务）
   */
  s3Endpoint: string;

  /**
   * S3区域 - 如 us-east-1
   * 【注意】Cloudflare R2 使用 "auto"
   */
  s3Region: string;

  /**
   * S3访问密钥ID
   * 【Java 对比】类似 AWS SDK 的 accessKeyId 配置
   */
  s3AccessKey: string;

  /**
   * S3访问密钥密码
   * 【安全性】类似数据库密码，应保存在环境变量中
   */
  s3SecretKey: string;

  /**
   * S3存储桶名称
   * 【概念】Bucket 类似文件夹，用于组织存储对象
   */
  s3Bucket: string;

  /**
   * S3公开访问基础URL - 用于生成文件的公开访问地址
   * 【说明】通过 CDN 域名访问，提供更快的下载速度
   * 例如：https://s3-cf.caicaizi.xyz
   */
  s3PublicBaseUrl: string;

  /**
   * CORS 允许的来源列表（生产环境必填）
   */
  corsAllowedOrigins: string[];

  /**
   * 认证限流窗口（毫秒）
   */
  authRateLimitWindowMs: number;

  /**
   * 认证限流最大请求数（每窗口）
   */
  authRateLimitMax: number;

  /**
   * 上传最大文件大小（字节）
   */
  uploadMaxBytes: number;

  /**
   * 允许的上传 MIME 类型
   */
  uploadAllowedMimeTypes: string[];

  /**
   * 允许的上传扩展名
   */
  uploadAllowedExtensions: string[];

  /**
   * 日志级别
   */
  logLevel: "debug" | "info" | "warn" | "error";
};

/**
 * 解析时间间隔字符串为秒数
 *
 * 【Java 对比】类似工具类的静态方法：
 * ```java
 * public class DurationUtils {
 *     public static int parseDuration(String input) { ... }
 * }
 * ```
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
 * 实现逻辑：
 * 1. 使用正则表达式提取数字和单位
 * 2. 根据单位乘以对应的转换系数
 * 3. 如果不匹配，当作纯数字处理
 *
 * @example
 * parseDuration("30s")   // 返回: 30
 * parseDuration("15m")   // 返回: 900
 * parseDuration("2h")    // 返回: 7200
 * parseDuration("7d")    // 返回: 604800
 * parseDuration("100")   // 返回: 100
 */
function parseDuration(input: string): number {
  // 正则表达式：匹配 "数字+单位" 格式
  // 【Java 对比】类似 Pattern.compile("^(\\d+)([smhd])$")
  const match = input.match(/^(\d+)([smhd])$/);

  if (!match) {
    // 如果不匹配格式，则当作纯数字处理
    // 【Java 对比】类似 Integer.parseInt(input)
    return Number(input);
  }

  // 数组解构赋值：从正则匹配结果中提取值
  // match[0] = 完整匹配，match[1] = 数字部分，match[2] = 单位部分
  // 【Java 对比】
  // String valueStr = match.group(1);
  // String unit = match.group(2);
  const value = Number(match[1]);
  const unit = match[2] as DurationUnit;

  // 时间单位到秒的转换映射
  // 【Java 对比】类似 Map<DurationUnit, Integer>
  const map: Record<DurationUnit, number> = {
    s: 1,        // 秒：1秒 = 1秒
    m: 60,       // 分钟：1分 = 60秒
    h: 3600,     // 小时：1时 = 3600秒
    d: 86400     // 天：1天 = 86400秒
  };

  return value * map[unit];
}

/**
 * 解析逗号分隔列表
 */
function parseList(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 解析数字配置
 */
function parseNumber(name: string, value: string, min?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`${name} must be >= ${min}`);
  }
  return parsed;
}

/**
 * 解析日志级别
 */
function parseLogLevel(value: string): AppConfig["logLevel"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  throw new Error("LOG_LEVEL must be one of: debug, info, warn, error");
}

/**
 * 获取环境变量，不存在时使用默认值或抛出错误
 *
 * 【Java 对比】类似 Spring 的 @Value 注解：
 * ```java
 * @Value("${database.url:#{null}}")
 * private String databaseUrl;
 * ```
 *
 * @param name - 环境变量名称，如 "DATABASE_URL"
 * @param fallback - 默认值（可选），如果环境变量不存在则使用此值
 * @returns 环境变量的值或默认值
 * @throws {Error} 当环境变量不存在且没有提供默认值时抛出错误
 *
 * 使用场景：
 * - 必需的配置：不提供 fallback，确保配置存在
 * - 可选的配置：提供 fallback 作为默认值
 *
 * @example
 * // 必需的环境变量（无默认值）
 * getEnv("DATABASE_URL")  // 不存在会抛出异常
 *
 * // 可选的环境变量（有默认值）
 * getEnv("PORT", "3000")  // 不存在则使用 "3000"
 *
 * 【实现细节】
 * - process.env: Node.js 全局对象，存储所有环境变量
 * - ??: 空值合并运算符，类似 Java 的 Optional.orElse()
 */
function getEnv(name: string, fallback?: string): string {
  // ?? 空值合并运算符：如果左侧为 null/undefined，则使用右侧
  // 【Java 对比】类似：
  // String value = Optional.ofNullable(process.env.get(name)).orElse(fallback);
  const value = process.env[name] ?? fallback;

  if (!value) {
    // 抛出错误，类似 Java 的 throw new IllegalArgumentException()
    throw new Error(`${name} is required`);
  }

  return value;
}

/**
 * 应用配置对象（单例）
 *
 * 【Java 对比】类似 Spring 的 @Configuration 单例 Bean：
 * ```java
 * @Configuration
 * public class AppConfig {
 *     @Bean
 *     public ConfigProperties configProperties() {
 *         return new ConfigProperties(
 *             getEnv("JWT_ACCESS_SECRET"),
 *             getEnv("JWT_REFRESH_SECRET"),
 *             ...
 *         );
 *     }
 * }
 * ```
 *
 * 【重要】JavaScript/TypeScript 中的模块系统：
 * - export const 导出的对象是单例的
 * - 无论在哪里 import，都是同一个实例
 * - 类似 Spring 的单例 Bean
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
 * - CORS_ALLOWED_ORIGINS: 允许的前端域名列表（生产环境必需）
 * - AUTH_RATE_LIMIT_WINDOW_MS: 认证限流窗口（毫秒）
 * - AUTH_RATE_LIMIT_MAX: 认证限流最大次数
 * - UPLOAD_MAX_BYTES: 上传最大文件大小（字节）
 * - UPLOAD_ALLOWED_MIME_TYPES: 允许的上传 MIME 类型列表
 * - UPLOAD_ALLOWED_EXTENSIONS: 允许的上传扩展名列表
 * - LOG_LEVEL: 日志级别（debug/info/warn/error）
 *
 * 使用方式：
 * ```typescript
 * import { config } from "./config";
 *
 * console.log(config.jwtAccessSecret);  // 访问配置
 * ```
 *
 * 【注意】
 * 1. 此对象在模块首次加载时创建（应用启动时）
 * 2. 如果环境变量缺失，会立即抛出错误，应用无法启动
 * 3. 配置值在运行时不可修改（类似 final 字段）
 */
export const config: AppConfig = {
  // JWT 相关配置
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  jwtAccessTtlSeconds: parseDuration(getEnv("JWT_ACCESS_TTL", "900")),      // 默认 15 分钟
  jwtRefreshTtlSeconds: parseDuration(getEnv("JWT_REFRESH_TTL", "2592000")), // 默认 30 天

  // S3 对象存储配置
  s3Endpoint: getEnv("S3_ENDPOINT"),
  s3Region: getEnv("S3_REGION", "us-east-1"),
  s3AccessKey: getEnv("S3_ACCESS_KEY"),
  s3SecretKey: getEnv("S3_SECRET_KEY"),
  s3Bucket: getEnv("S3_BUCKET"),

  // S3 公开访问 URL（通过 CDN）
  // || 逻辑或运算符：如果环境变量为空字符串，使用默认值 ""
  // 【Java 对比】类似三元运算符：process.env.S3_PUBLIC_BASE_URL != null ? process.env.S3_PUBLIC_BASE_URL : ""
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || "",

  // CORS 允许来源（生产环境强制校验）
  corsAllowedOrigins: (() => {
    const origins = parseList(process.env.CORS_ALLOWED_ORIGINS ?? "");
    if (process.env.NODE_ENV === "production" && origins.length === 0) {
      throw new Error("CORS_ALLOWED_ORIGINS is required in production");
    }
    return origins;
  })(),

  // 认证限流配置
  authRateLimitWindowMs: parseNumber(
    "AUTH_RATE_LIMIT_WINDOW_MS",
    getEnv("AUTH_RATE_LIMIT_WINDOW_MS", "60000"),
    1000
  ),
  authRateLimitMax: parseNumber(
    "AUTH_RATE_LIMIT_MAX",
    getEnv("AUTH_RATE_LIMIT_MAX", "10"),
    1
  ),

  // 上传限制
  uploadMaxBytes: parseNumber(
    "UPLOAD_MAX_BYTES",
    getEnv("UPLOAD_MAX_BYTES", String(10 * 1024 * 1024)),
    1
  ),
  uploadAllowedMimeTypes: parseList(
    getEnv("UPLOAD_ALLOWED_MIME_TYPES", "image/jpeg,image/png,application/pdf")
  ).map((entry) => entry.toLowerCase()),
  uploadAllowedExtensions: parseList(
    getEnv("UPLOAD_ALLOWED_EXTENSIONS", "jpg,jpeg,png,pdf")
  ).map((entry) => entry.toLowerCase()),

  // 日志级别
  logLevel: parseLogLevel(getEnv("LOG_LEVEL", "info"))
};
