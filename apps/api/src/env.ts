import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * 环境变量加载配置
 *
 * 【Monorepo 最佳实践】
 * 在 Monorepo 中，每个应用应该有自己的 .env 文件，而不是共享根目录的 .env
 * 这样可以：
 * 1. 避免环境变量冲突
 * 2. 更好地隔离配置
 * 3. 每个应用独立管理自己的配置
 *
 * 【文件位置】
 * - apps/api/.env - API 应用的环境变量
 * - apps/web/.env - Web 应用的环境变量（Next.js 自动加载）
 * - apps/worker/.env - Worker 应用的环境变量
 *
 * 【加载优先级】（从高到低）
 * 1. .env.{NODE_ENV}.local - 环境特定的本地配置（如 .env.development.local）
 * 2. .env.{NODE_ENV} - 环境特定的配置（如 .env.development）
 * 3. .env.local - 本地配置（不提交到 Git）
 * 4. .env - 默认配置（可提交示例文件 .env.example）
 */

// 获取当前文件所在目录（apps/api/src）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// API 应用根目录（apps/api）
const apiRootDir = path.resolve(__dirname, "..");

// 环境类型（development, production, test）
const env = process.env.NODE_ENV || "development";

// 环境变量文件加载顺序（优先级从高到低）
const envFiles = [
  path.join(apiRootDir, `.env.${env}.local`), // apps/api/.env.development.local
  path.join(apiRootDir, `.env.${env}`),       // apps/api/.env.development
  path.join(apiRootDir, ".env.local"),        // apps/api/.env.local
  path.join(apiRootDir, ".env"),              // apps/api/.env
];

// 加载环境变量文件
envFiles.forEach((file) => {
  config({ path: file, override: false }); // 注意：override: false 保持优先级
});
