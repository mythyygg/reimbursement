import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@reimbursement/shared/db";
import { config } from "../config";

// 配置连接池以提高性能
export const pool = new Pool({
  connectionString: config.databaseUrl,
  // 连接池配置
  max: 10, // worker使用较小的连接池
  min: 1, // 最小连接数
  idleTimeoutMillis: 30000, // 空闲连接30秒后释放
  connectionTimeoutMillis: 10000, // 连接超时10秒
  // 性能优化
  keepAlive: true, // 启用TCP keep-alive
  keepAliveInitialDelayMillis: 10000, // 10秒后开始keep-alive
});

// 监听连接错误
pool.on('error', (err) => {
  console.error('[worker] [DB] Unexpected error on idle client', err);
});

export const db = drizzle(pool, { schema });
