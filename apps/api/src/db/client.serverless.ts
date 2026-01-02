/**
 * Serverless 数据库客户端配置
 *
 * 针对 Serverless 环境优化的数据库连接配置
 * 与传统 Node.js 服务器不同，Serverless 函数有以下特点：
 * 1. 短生命周期：执行完毕后可能被销毁
 * 2. 并发限制：每个函数实例只处理一个请求
 * 3. 冷启动：首次调用或长时间未使用后需要重新初始化
 *
 * 因此连接池配置需要相应调整
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Serverless 优化的连接池配置
 *
 * 与传统服务器配置的区别：
 * - max: 1-2（而非 20）- Serverless 函数并发受限
 * - min: 0（而非 2）- 避免保持空闲连接
 * - idleTimeoutMillis: 1000（而非 30000）- 快速释放连接
 */
export const pool = new Pool({
  connectionString,
  // Serverless 优化配置
  max: 1, // 每个函数实例最多 1 个连接（Serverless 单请求处理）
  idleTimeoutMillis: 1000, // 空闲 1 秒后立即释放
  connectionTimeoutMillis: 5000, // 连接超时 5 秒（更短）
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

export const db = drizzle(pool, { schema });
