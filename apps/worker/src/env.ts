import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../");

// 根据 NODE_ENV 加载对应的环境文件，优先级从高到低
const env = process.env.NODE_ENV || "development";
const envFiles = [
  path.join(rootDir, `.env.${env}.local`), // e.g. .env.development.local
  path.join(rootDir, `.env.${env}`), // e.g. .env.development
  path.join(rootDir, ".env.local"),
  path.join(rootDir, ".env"),
];

envFiles.forEach((file) => {
  config({ path: file, override: false });
});
