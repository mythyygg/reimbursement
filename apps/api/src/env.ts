import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * 环境变量加载配置模块
 *
 * @description
 * 该模块负责加载项目的环境变量配置：
 * 1. 首先尝试加载当前工作目录的 .env 文件
 * 2. 然后尝试加载仓库根目录的 .env 文件作为备选
 * 3. 使用 override: false 确保已存在的环境变量不会被覆盖
 *
 * 文件路径解析：
 * - cwdEnv: 当前工作目录下的 .env
 * - repoRootEnv: 仓库根目录的 .env（src/ → api/ → apps/ → repo root）
 *
 * @module env
 */

// 获取当前文件的目录路径（ES模块兼容）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 当前工作目录的 .env 文件路径
const cwdEnv = path.resolve(process.cwd(), ".env");
// 仓库根目录的 .env 文件路径（向上3级：src/ → api/ → apps/ → repo root）
const repoRootEnv = path.resolve(__dirname, "../../../.env");

// 先加载当前工作目录的 .env，再加载仓库根目录的 .env 作为备选
// override: false 确保已有的环境变量不会被覆盖
config({ path: cwdEnv, override: false });
config({ path: repoRootEnv, override: false });
