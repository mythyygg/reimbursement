import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwdEnv = path.resolve(process.cwd(), ".env");
const repoRootEnv = path.resolve(__dirname, "../../../.env");

config({ path: cwdEnv, override: false });
config({ path: repoRootEnv, override: false });
