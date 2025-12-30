import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRootDir = path.resolve(__dirname, "..");

// 根据 NODE_ENV 加载对应的环境文件，优先级从高到低
const env = process.env.NODE_ENV || "development";
const envFiles = [
  path.join(workerRootDir, `.env.${env}.local`), // apps/worker/.env.development.local
  path.join(workerRootDir, `.env.${env}`), // apps/worker/.env.development
  path.join(workerRootDir, ".env.local"),
  path.join(workerRootDir, ".env"),
];

envFiles.forEach((file) => {
  config({ path: file, override: false });
});
