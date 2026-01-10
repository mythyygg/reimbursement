/**
 * 数据库表结构定义
 *
 * 【Java 对比 - Drizzle ORM vs JPA/Hibernate】
 *
 * 本文件使用 Drizzle ORM 定义数据库表结构，类似 JPA 的 @Entity 注解：
 *
 * JPA/Hibernate 风格：
 * ```java
 * @Entity
 * @Table(name = "users")
 * public class User {
 *     @Id
 *     @GeneratedValue(strategy = GenerationType.UUID)
 *     private UUID userId;
 *
 *     @Column(unique = true, nullable = false)
 *     private String emailOrPhone;
 *
 *     @Column(nullable = false)
 *     private String passwordHash;
 * }
 * ```
 *
 * Drizzle ORM 风格（本项目）：
 * ```typescript
 * export const users = pgTable("users", {
 *   userId: uuid("user_id").defaultRandom().primaryKey(),
 *   emailOrPhone: text("email_or_phone").notNull(),
 *   passwordHash: text("password_hash").notNull()
 * });
 * ```
 *
 * 主要区别：
 * 1. 【定义方式】Drizzle 使用函数式定义，JPA 使用类+注解
 * 2. 【类型安全】两者都提供编译时类型检查
 * 3. 【关系映射】Drizzle 需要手动 JOIN，JPA 自动处理 @OneToMany/@ManyToOne
 * 4. 【性能】Drizzle 更轻量，生成的 SQL 更可控
 *
 * 数据类型对照表：
 * | Drizzle ORM        | PostgreSQL | Java/JPA           |
 * |--------------------|------------|--------------------|
 * | uuid()             | UUID       | UUID               |
 * | text()             | TEXT       | String             |
 * | integer()          | INTEGER    | Integer/int        |
 * | numeric(12, 2)     | NUMERIC    | BigDecimal         |
 * | boolean()          | BOOLEAN    | Boolean/boolean    |
 * | timestamp()        | TIMESTAMP  | LocalDateTime/Date |
 * | jsonb()            | JSONB      | 需要转换器          |
 *
 * 表关系设计：
 * - users (用户) ←─ 1:N ─→ projects (项目)
 * - projects (项目) ←─ 1:N ─→ expenses (费用)
 * - projects (项目) ←─ 1:N ─→ receipts (票据)
 * - expenses (费用) ←─ M:N ─→ receipts (票据) [通过 expenseReceipts 关联表]
 *
 * 【注意】
 * - 本文件定义表结构（DDL），不包含数据操作（DML）
 * - 类似 JPA 的实体类，但只定义结构，不包含业务逻辑
 * - 所有表都由 apps/api（含内置 worker）共享使用
 */

import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * 用户表
 * 存储用户的基本认证信息和账户状态
 *
 * @description
 * - 使用 emailOrPhone 作为唯一登录凭证（支持邮箱或手机号）
 * - passwordHash 存储加密后的密码
 * - sessionVersion 用于批量撤销所有会话（修改版本号可使所有现有token失效）
 * - status 标记账户状态，默认为"active"，可扩展为"suspended"、"deleted"等
 */
export const users = pgTable(
  "users",
  {
    /** 用户唯一标识符 - UUID主键 */
    userId: uuid("user_id").defaultRandom().primaryKey(),
    /** 登录账号 - 邮箱或手机号，全局唯一 */
    emailOrPhone: text("email_or_phone").notNull(),
    /** 密码哈希值 - 使用bcrypt等算法加密存储 */
    passwordHash: text("password_hash").notNull(),
    /** 会话版本号 - 用于批量撤销所有登录会话，修改此值后所有旧token失效 */
    sessionVersion: integer("session_version").notNull().default(0),
    /** 账户状态 - active(活跃) | suspended(暂停) | deleted(已删除)，使用字符串以支持未来扩展 */
    status: text("status").notNull().default("active"),
    /** 账户创建时间 */
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** 账户最后更新时间 */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailOrPhoneUnique: uniqueIndex("users_email_or_phone_key").on(
      table.emailOrPhone
    ),
  })
);

/**
 * 项目表
 * 用于组织和管理费用报销，一个用户可以创建多个项目
 *
 * @description
 * - 每个项目归属于一个用户
 * - name 可为空，API层会过滤掉空白草稿项目
 * - pinned 标记置顶项目，方便快速访问
 * - archived 标记归档项目，不在主列表显示
 * - tags 支持多标签分类，存储为JSON数组
 */
export const projects = pgTable("projects", {
  /** 项目唯一标识符 - UUID主键 */
  projectId: uuid("project_id").defaultRandom().primaryKey(),
  /** 所属用户ID */
  userId: uuid("user_id").notNull(),
  /** 项目名称 - 可为空（草稿状态），API会过滤空名称的项目 */
  name: text("name"),
  /** 项目描述 */
  description: text("description"),
  /** 是否置顶 - 置顶项目在列表中优先显示 */
  pinned: boolean("pinned").notNull().default(false),
  /** 是否已归档 - 归档项目不在主列表显示，但数据保留 */
  archived: boolean("archived").notNull().default(false),
  /** 标签数组 - 用于分类和筛选，存储为JSONB格式 */
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  /** 项目创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 项目最后更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * 费用条目表
 * 存储需要报销的费用记录，可能有也可能没有对应的票据
 *
 * @description
 * - 每条费用记录必须关联到某个项目
 * - status 表示报销单处理状态：pending(新建) | processing(处理中) | completed(已报销)
 * - manualStatus 标记是否由用户手动设置状态，手动设置后系统不会自动修改
 * - clientRequestId 用于幂等性控制，防止重复提交
 * - amount 使用 NUMERIC(12,2) 确保金额计算精度
 */
export const expenses = pgTable("expenses", {
  /** 费用唯一标识符 - UUID主键 */
  expenseId: uuid("expense_id").defaultRandom().primaryKey(),
  /** 所属用户ID */
  userId: uuid("user_id").notNull(),
  /** 所属项目ID */
  projectId: uuid("project_id").notNull(),
  /** 费用发生日期 */
  date: timestamp("date", { withTimezone: true }).notNull(),
  /** 费用金额 - 精度12位整数+2位小数，支持最大9999亿 */
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** 费用类别 - 如交通、餐饮、住宿等 */
  category: text("category"),
  /** 备注说明 */
  note: text("note").notNull(),
  /** 报销单状态 - pending | processing | completed */
  status: text("status").notNull().default("pending"),
  /** 是否手动设置状态 - true时系统不再自动更新status */
  manualStatus: boolean("manual_status").notNull().default(false),
  /** 客户端请求ID - 用于幂等性控制，防止重复提交 */
  clientRequestId: text("client_request_id"),
  /** 费用创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 费用最后更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * 票据表
 * 存储上传的票据图片及其关联信息
 *
 * @description
 * - matchedExpenseId 关联已关联的费用条目
 * - duplicateFlag 标记疑似重复的票据
 * - hash 用于检测重复上传（相同文件内容）
 * - deletedAt 软删除标记，保留数据但不显示
 */
export const receipts = pgTable("receipts", {
  /** 票据唯一标识符 - UUID主键 */
  receiptId: uuid("receipt_id").defaultRandom().primaryKey(),
  /** 所属用户ID */
  userId: uuid("user_id").notNull(),
  /** 所属项目ID */
  projectId: uuid("project_id").notNull(),
  /** 文件访问URL - 对象存储的公开或签名URL */
  fileUrl: text("file_url"),
  /** 对象存储Key - 用于后端访问和管理文件 */
  storageKey: text("storage_key"),
  /** 文件扩展名 - jpg、png、pdf等 */
  fileExt: text("file_ext"),
  /** 文件大小（字节） */
  fileSize: integer("file_size"),
  /** 文件内容哈希值 - 用于检测重复上传，如MD5或SHA256 */
  hash: text("hash"),
  /** 客户端请求ID - 用于幂等性控制，防止重复提交 */
  clientRequestId: text("client_request_id"),
  /** 上传状态 - pending | uploaded | failed */
  uploadStatus: text("upload_status").notNull().default("pending"),
  /** 商户关键词 - 用户输入的商户名称 */
  merchantKeyword: text("merchant_keyword"),
  /** 票据金额 - 用户确认或修正后的最终金额 */
  receiptAmount: numeric("receipt_amount", { precision: 12, scale: 2 }),
  /** 票据日期 - 用户确认或修正后的最终日期 */
  receiptDate: timestamp("receipt_date", { withTimezone: true }),
  /** 票据类型 - 如增值税发票、普通发票、收据等 */
  receiptType: text("receipt_type"),
  /** 已关联的费用ID - 关联到expenses表，一张票据只能匹配一个费用 */
  matchedExpenseId: uuid("matched_expense_id"),
  /** 重复标记 - 标记疑似重复的票据（基于hash、金额、日期等规则判断） */
  duplicateFlag: boolean("duplicate_flag").notNull().default(false),
  /** 票据创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 票据最后更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 软删除时间 - 非空表示已删除，数据保留但不显示 */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * 费用-票据关联表
 * 建立费用与票据的多对多关系，但通过唯一索引确保一张票据只能关联一个费用
 *
 * @description
 * - 一个费用可以关联多张票据（如火车票+保险票）
 * - 一张票据只能关联一个费用（通过 receiptId 唯一索引保证）
 * - 这种设计为将来可能的多票据关联预留了扩展性
 */
export const expenseReceipts = pgTable(
  "expense_receipts",
  {
    /** 费用ID */
    expenseId: uuid("expense_id").notNull(),
    /** 票据ID - 通过唯一索引确保一张票据只能关联一个费用 */
    receiptId: uuid("receipt_id").notNull(),
    /** 关联创建时间 */
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    receiptUnique: uniqueIndex("expense_receipts_receipt_id_key").on(
      table.receiptId
    ),
  })
);


/**
 * 用户设置表
 * 存储每个用户的功能开关和配置模板
 *
 * @description
 * - 以 userId 为主键，每个用户一条记录
 * - matchRulesJson 存储票据与费用的匹配规则（日期窗口、金额容差等）
 *
 */
export const settings = pgTable("settings", {
  /** 用户ID - 主键 */
  userId: uuid("user_id").primaryKey(),
  /** 匹配规则配置 - 票据与费用的自动匹配规则 */
  matchRulesJson: jsonb("match_rules_json")
    .$type<Record<string, unknown>>()
    .notNull(),
  /** 设置最后更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * 认证会话表
 * 存储刷新令牌和设备会话信息
 *
 * @description
 * - 每次用户登录创建一个会话记录
 * - refreshTokenHash 存储刷新令牌的哈希值（不存储明文）
 * - 记录设备信息、User-Agent、IP等用于安全审计
 * - expiresAt 设置刷新令牌过期时间
 * - revokedAt 用于主动撤销会话（如退出登录、修改密码）
 * - lastSeenAt 记录最后活跃时间，用于识别不活跃会话
 */
export const authSessions = pgTable("auth_sessions", {
  /** 会话唯一标识符 - UUID主键 */
  sessionId: uuid("session_id").defaultRandom().primaryKey(),
  /** 所属用户ID */
  userId: uuid("user_id").notNull(),
  /** 刷新令牌哈希值 - 存储哈希而非明文，提高安全性 */
  refreshTokenHash: text("refresh_token_hash").notNull(),
  /** 设备信息 - 如 "iPhone 13 Pro" */
  deviceInfo: text("device_info"),
  /** 用户代理字符串 - 浏览器和系统信息 */
  userAgent: text("user_agent"),
  /** 客户端IP地址 - 用于安全审计和异常检测 */
  ip: text("ip"),
  /** 刷新令牌过期时间 - 通常设置为7天或30天 */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** 最后活跃时间 - 每次使用刷新令牌时更新 */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 撤销时间 - 非空表示会话已被撤销（退出登录或密码变更） */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * 上传会话表
 * 管理票据文件的预签名上传流程
 *
 * @description
 * - 用于实现安全的直传对象存储功能（如S3、OSS）
 * - 流程：1) API创建上传会话，生成签名URL；2) 前端直接上传到对象存储；3) 上传完成后通知API
 * - signedUrl 是临时的预签名URL，仅在 expireAt 之前有效
 * - status 跟踪上传状态：created(已创建) | uploading(上传中) | completed(已完成) | failed(失败)
 * - maxSize 限制上传文件大小，防止滥用
 */
export const uploadSessions = pgTable("upload_sessions", {
  /** 上传会话唯一标识符 - UUID主键 */
  uploadId: uuid("upload_id").defaultRandom().primaryKey(),
  /** 关联的票据ID - 预先创建票据记录，然后上传文件 */
  receiptId: uuid("receipt_id").notNull(),
  /** 发起上传的用户ID */
  userId: uuid("user_id").notNull(),
  /** 预签名上传URL - 前端使用此URL直接上传到对象存储 */
  signedUrl: text("signed_url").notNull(),
  /** 预签名URL过期时间 - 通常设置为5-15分钟 */
  expireAt: timestamp("expire_at", { withTimezone: true }).notNull(),
  /** 对象存储Key - 文件在对象存储中的路径 */
  storageKey: text("storage_key").notNull(),
  /** 允许的内容类型 - 如 "image/jpeg", "image/png", "application/pdf" */
  contentType: text("content_type").notNull(),
  /** 最大文件大小（字节） - 防止上传过大文件 */
  maxSize: integer("max_size").notNull(),
  /** 上传状态 - created | uploading | completed | failed */
  status: text("status").notNull().default("created"),
});

/**
 * 下载日志表
 * 审计文件下载操作
 *
 * @description
 * - 记录所有文件下载行为（导出文件、票据图片等）
 * - 用于安全审计、使用统计和问题排查
 * - 记录下载者的IP和User-Agent，便于追踪异常访问
 */
export const downloadLogs = pgTable("download_logs", {
  /** 下载记录唯一标识符 - UUID主键 */
  downloadId: uuid("download_id").defaultRandom().primaryKey(),
  /** 下载用户ID */
  userId: uuid("user_id").notNull(),
  /** 文件类型 - export(导出文件) | receipt(票据图片) | batch(批次文件) */
  fileType: text("file_type").notNull(),
  /** 文件ID - 根据 fileType 关联到不同表（exportId、receiptId等） */
  fileId: uuid("file_id").notNull(),
  /** 下载者IP地址 - 用于安全审计 */
  ip: text("ip"),
  /** 用户代理字符串 - 记录下载客户端信息 */
  userAgent: text("user_agent"),
  /** 下载记录创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * 后台任务表
 * 用于替代 Redis/BullMQ 实现基于数据库的任务队列
 */
export const backendJobs = pgTable("backend_jobs", {
  /** 任务唯一标识符 */
  jobId: uuid("job_id").defaultRandom().primaryKey(),
  /** 任务类型：batch_check | export */
  type: text("type").notNull(),
  /** 任务参数 - JSON 格式存储 */
  payload: jsonb("payload").notNull(),
  /** 任务状态：pending | processing | completed | failed */
  status: text("status").notNull().default("pending"),
  /** 错误信息 - 任务失败时记录 */
  error: text("error"),
  /** 尝试次数 - 用于失败重试 */
  attempts: integer("attempts").notNull().default(0),
  /** 下次重试时间 */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 任务开始时间 */
  startedAt: timestamp("started_at", { withTimezone: true }),
  /** 任务完成时间 */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** 创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** 最后更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
