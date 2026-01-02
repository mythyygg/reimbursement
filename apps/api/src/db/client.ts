/**
 * 数据库客户端配置
 *
 * 【Java 对比 - 类似 Spring Boot 的 DataSource 配置】
 *
 * 本文件等同于 Spring Boot 的数据源配置：
 * ```java
 * @Configuration
 * public class DataSourceConfig {
 *     @Bean
 *     public DataSource dataSource() {
 *         HikariConfig config = new HikariConfig();
 *         config.setJdbcUrl(env.getProperty("spring.datasource.url"));
 *         config.setMaximumPoolSize(20);
 *         config.setMinimumIdle(2);
 *         config.setIdleTimeout(30000);
 *         config.setConnectionTimeout(10000);
 *         return new HikariDataSource(config);
 *     }
 *
 *     @Bean
 *     public EntityManager entityManager(DataSource dataSource) {
 *         return EntityManagerFactory.createEntityManager();
 *     }
 * }
 * ```
 *
 * 【技术栈说明】
 * - pg (node-postgres): PostgreSQL 官方驱动，类似 JDBC Driver
 * - Pool: 数据库连接池，类似 HikariCP
 * - Drizzle ORM: 轻量级 ORM，类似 JPA/Hibernate（但更轻量）
 *
 * 【连接池的重要性】
 * 1. 复用连接，避免频繁创建/销毁（昂贵的操作）
 * 2. 限制并发连接数，保护数据库
 * 3. 自动管理空闲连接的生命周期
 *
 * 【Drizzle ORM vs JPA】
 * - Drizzle: 更接近 SQL，性能更好，类型安全
 * - JPA: 更抽象，功能更丰富，学习曲线平缓
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./index.js";

/**
 * 获取数据库连接字符串
 *
 * 【环境变量格式】
 * postgresql://用户名:密码@主机:端口/数据库名?参数
 *
 * 示例：
 * postgresql://neondb_owner:password@host.neon.tech/reimbursement?sslmode=require
 *
 * 【Java 对比】类似：
 * spring.datasource.url=jdbc:postgresql://host:5432/reimbursement
 * spring.datasource.username=neondb_owner
 * spring.datasource.password=password
 */
const connectionString = process.env.DATABASE_URL;

// 启动时检查配置，避免运行时才发现问题
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * 创建 PostgreSQL 连接池
 *
 * 【Java 对比】类似 HikariCP 连接池：
 * ```java
 * HikariConfig config = new HikariConfig();
 * config.setMaximumPoolSize(20);      // 最大连接数
 * config.setMinimumIdle(2);           // 最小空闲连接
 * config.setIdleTimeout(30000);       // 空闲超时
 * config.setConnectionTimeout(10000); // 连接超时
 * HikariDataSource pool = new HikariDataSource(config);
 * ```
 *
 * 【连接池配置说明】
 * - max: 20 - 最大连接数
 *   - 过大：消耗数据库资源
 *   - 过小：高并发时等待连接
 *   - 推荐：CPU 核心数 * 2 ~ 4
 *
 * - min: 2 - 最小保持的空闲连接数
 *   - 作用：应对突发流量，减少连接建立延迟
 *   - 温连接：即使空闲也保持
 *
 * - idleTimeoutMillis: 30000 - 空闲连接 30 秒后释放
 *   - 平衡资源占用和响应速度
 *   - 超过 min 数量的连接会被回收
 *
 * - connectionTimeoutMillis: 10000 - 连接超时 10 秒
 *   - 获取连接的最大等待时间
 *   - 超时抛出异常，避免无限等待
 *
 * - keepAlive: true - 启用 TCP keep-alive
 *   - 防止长时间空闲连接被防火墙/代理断开
 *   - 定期发送心跳包
 *
 * - keepAliveInitialDelayMillis: 10000 - 10 秒后开始 keep-alive
 *   - 连接建立后多久开始发送心跳
 */
export const pool = new Pool({
  connectionString,
  // 连接池配置
  max: 20, // 最大连接数（根据应用负载调整）
  min: 2, // 最小连接数（保持温连接，快速响应）
  idleTimeoutMillis: 30000, // 空闲连接 30 秒后释放
  connectionTimeoutMillis: 10000, // 连接超时 10 秒
  // 性能优化
  keepAlive: true, // 启用 TCP keep-alive（防止连接被断开）
  keepAliveInitialDelayMillis: 10000, // 10 秒后开始 keep-alive
});

/**
 * 监听连接池错误事件
 *
 * 【Java 对比】类似 DataSource 的异常处理：
 * ```java
 * dataSource.addDataSourceEventListener(event -> {
 *     if (event.getEventType() == DataSourceEventType.CONNECTION_ERROR) {
 *         logger.error("Database connection error", event.getException());
 *     }
 * });
 * ```
 *
 * 作用：
 * - 记录空闲客户端的意外错误
 * - 帮助诊断数据库连接问题
 * - 避免未捕获的异常导致应用崩溃
 */
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  // 生产环境应该：
  // 1. 发送告警通知
  // 2. 记录到日志服务（如 CloudWatch, Datadog）
  // 3. 可能需要重启连接池
});

/**
 * 创建 Drizzle ORM 实例
 *
 * 【Java 对比】类似创建 JPA EntityManager：
 * ```java
 * EntityManager em = entityManagerFactory.createEntityManager();
 * ```
 *
 * 【参数说明】
 * - pool: 数据库连接池，提供底层连接
 * - schema: 表结构定义（从 packages/shared/db/schema.ts 导入）
 *   - 包含所有表的定义（users, projects, receipts 等）
 *   - 提供类型安全的查询 API
 *
 * 【使用示例】
 * ```typescript
 * // 查询（类似 em.find(User.class, id)）
 * const user = await db.query.users.findFirst({
 *   where: eq(users.userId, id)
 * });
 *
 * // 插入（类似 em.persist(user)）
 * await db.insert(users).values({ name: "张三" });
 *
 * // 更新（类似 em.merge(user)）
 * await db.update(users)
 *   .set({ name: "李四" })
 *   .where(eq(users.userId, id));
 *
 * // 删除（类似 em.remove(user)）
 * await db.delete(users).where(eq(users.userId, id));
 *
 * // JOIN 查询（类似 JPQL）
 * const result = await db
 *   .select()
 *   .from(projects)
 *   .innerJoin(users, eq(projects.userId, users.userId));
 * ```
 *
 * 【导出说明】
 * - export: 导出给其他模块使用
 * - const: 常量，不可重新赋值
 * - db: 单例对象，整个应用共享（类似 Spring 的 @Bean）
 */
export const db = drizzle(pool, { schema });
