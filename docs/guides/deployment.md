# 报销系统部署指南 (Vercel + 通用 Docker)

本指南针对 **前端 (Vercel)** + **后端 (Docker 容器化，任意云/VPS 均可)** 的部署组合，提供详细的操作步骤与最佳实践。默认假设你直接从 GitHub 主分支拉取代码部署。

---

## 📋 项目架构

- **前端 (Web)**: Next.js -> Vercel (静态 + SSR)
- **后端 (API)**: Hono -> Docker 容器（可部署到任意支持容器的服务，如自建 VPS、ECS、Fly.io、Render 等）
- **数据库**: PostgreSQL (Supabase / Neon)
- **对象存储**: Cloudflare R2 (S3 兼容)
- **CI/CD**: GitHub Actions (自动检查) + Vercel/容器平台 (自动部署)

---

## 🌐 生产环境信息（示例域名，替换为你自己的）

- **Web (Vercel)**: `https://m-reimburse.example.com`
- **API (Docker 部署)**: `https://api-reimburse.example.com`

---

## 1. 准备工作：环境变量

在开始部署前，请准备好以下关键凭证。**Monorepo 最佳实践：apps/api 与 apps/web 各自维护独立 .env，勿放在仓库根目录。**

### 后端变量 (API - Docker 部署)

| 变量名                     | 说明                                       | 示例/备注                                                                 |
| :------------------------- | :----------------------------------------- | :------------------------------------------------------------------------ |
| `DATABASE_URL`             | 数据库连接串                               | 建议开启连接池/SSL：`?sslmode=require`                                   |
| `JWT_ACCESS_SECRET`        | 访问 Token 签名密钥                        | `openssl rand -base64 32`                                                 |
| `JWT_REFRESH_SECRET`       | 刷新 Token 密钥                            | 与 ACCESS 不同的随机密钥                                                  |
| `JWT_ACCESS_TTL`           | 访问令牌有效期                             | 默认 15m                                                                  |
| `JWT_REFRESH_TTL`          | 刷新令牌有效期                             | 默认 30d                                                                  |
| `S3_ENDPOINT`              | R2/S3 接口地址                             | `https://<accountid>.r2.cloudflarestorage.com`                            |
| `S3_REGION`                | 区域                                       | R2 用 `auto`                                                              |
| `S3_ACCESS_KEY`            | R2 Access Key ID                           |                                                                            |
| `S3_SECRET_KEY`            | R2 Secret Access Key                       |                                                                            |
| `S3_BUCKET`                | 存储桶名称                                 | 例如 `reimbursement`                                                      |
| `S3_PUBLIC_BASE_URL`       | （可选）对象公开访问域名                   | 如 `https://files.example.com`                                            |
| `CORS_ALLOWED_ORIGINS`     | 允许的前端域名（生产必填，逗号分隔）       | `https://m-reimburse.example.com`                                         |
| `PORT`                     | 服务端口                                   | 默认 `8787`，需与容器/平台暴露端口一致                                    |
| `NODE_ENV`                 | 环境                                       | `production`                                                              |
| `AUTH_RATE_LIMIT_WINDOW_MS`| 登录限流窗口                               | 默认 `60000`                                                              |
| `AUTH_RATE_LIMIT_MAX`      | 登录限流请求数                             | 默认 `10`                                                                 |
| `UPLOAD_MAX_BYTES`         | 上传大小限制（字节）                       | 默认 `10485760`（10MB）                                                   |
| `UPLOAD_ALLOWED_MIME_TYPES`| 允许的 MIME 类型                           | 默认 `image/jpeg,image/png,application/pdf`                               |
| `UPLOAD_ALLOWED_EXTENSIONS`| 允许的扩展名                               | 默认 `jpg,jpeg,png,pdf`                                                   |
| `LOG_LEVEL`                | 日志级别                                   | 默认 `info`                                                               |

### 前端变量 (Web - Vercel)

| 变量名                 | 说明               | 示例                                                       |
| :--------------------- | :----------------- | :--------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE` | API 地址（带 /api/v1） | `https://api-reimburse.example.com/api/v1`                 |
| `NEXT_PUBLIC_APP_URL`  | 前端站点完整 URL   | `https://m-reimburse.example.com`                          |

---

## 2. 后端部署选项

前端固定部署在 Vercel。后端可选 **Vercel（Serverless/Edge）** 或 **Cloudflare Workers/Pages**。若需自托管，再用 Docker 方案。

### 2.A Vercel（Serverless/Edge）

当前 API 入口是 Node 服务器 (`apps/api/dist/server.js`)，默认跑在长驻进程。要部署到 Vercel，需要先做适配：

1) **改入口**：将 `@hono/node-server` 改为 `hono/vercel`（或 `hono/adapter/vercel`），导出 handler；可拆分为 `api/` 目录函数。  
2) **移除内置循环**：仓库已无 worker，保持无后台循环即可。  
3) **连接池/冷启动**：使用无状态连接（Neon 自带）或 PgBouncer。  
4) **配置环境变量**：在 Vercel 项目中填入与表格一致的变量。  
5) **构建设置**：确保构建产物为 Vercel Functions；如需可提供单独 `vercel.json`/打包脚本。

> 备注：仓库当前未包含 Vercel 后端入口代码，如需要可按以上步骤补充后再部署。

#### 示例：Vercel Edge 入口（需自行新增文件）

在 `apps/api/src/vercel.ts`（或任意新入口）中：

```ts
// apps/api/src/vercel.ts
import app from "./index";
import { handle } from "hono/vercel";

export const runtime = "edge";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
```

并在 Vercel 创建独立项目指向 `apps/api`：
- Build Command: `npm --workspace apps/api run build`（如需 Edge 专用构建，可改为 bundler 步骤）
- Output / Functions: 自动由 `api/` 路由生成；若使用上方入口，可在根创建 `api/[[...route]]/route.ts` 代理至 `vercel.ts`。
- Env: 填写表格中的后端变量。

> 若使用 Node Serverless 而非 Edge，可将 `runtime` 去掉，并在入口导出 `default = handle(app);`。

### 2.B Cloudflare Workers / Pages Functions

同样需要 Edge 适配后再部署：

1) **改入口**：使用 `hono/adapter/cloudflare`（或 `hono/cloudflare-workers`），`server.ts` 导出 `fetch`。  
2) **环境绑定**：将变量映射到 Workers Env；对象存储用 R2 bindings，Postgres 可用 Cloudflare D1（需迁移 schema）或通过 Tunnels 连接外部 PG。  
3) **后台任务**：仓库已无 worker，保持无后台循环即可。  
4) **构建命令**：生成 Worker bundle（如 `wrangler deploy`），精简依赖以满足配额。

> 备注：当前仓库未含 Cloudflare 入口/配置，部署前需按上面改造。

#### 示例：Cloudflare Worker 入口与 wrangler 配置（需自行新增文件）

`apps/api/src/cloudflare.ts`：

```ts
import app from "./index";
import { handle } from "hono/cloudflare-workers";

export default {
  fetch: handle(app),
};
```

`apps/api/wrangler.toml`（示例，按需调整）：

```toml
name = "reimbursement-api"
main = "dist/cloudflare.js"          # 构建产物路径，请与打包工具保持一致
compatibility_date = "2024-12-01"

[vars]
NODE_ENV = "production"
DATABASE_URL = "..."
JWT_ACCESS_SECRET = "..."
JWT_REFRESH_SECRET = "..."
S3_ENDPOINT = "..."
S3_REGION = "auto"
S3_ACCESS_KEY = "..."
S3_SECRET_KEY = "..."
S3_BUCKET = "..."
S3_PUBLIC_BASE_URL = ""
CORS_ALLOWED_ORIGINS = "https://m-reimburse.example.com"
AUTH_RATE_LIMIT_WINDOW_MS = "60000"
AUTH_RATE_LIMIT_MAX = "10"
UPLOAD_MAX_BYTES = "10485760"
UPLOAD_ALLOWED_MIME_TYPES = "image/jpeg,image/png,application/pdf"
UPLOAD_ALLOWED_EXTENSIONS = "jpg,jpeg,png,pdf"
LOG_LEVEL = "info"
```

构建发布思路：
- 使用 `esbuild/tsup/rolldown` 将 `apps/api/src/cloudflare.ts` 打包为 `dist/cloudflare.js`（Worker 兼容）。
- 部署命令：`cd apps/api && wrangler deploy`。

### 2.C Docker（自托管备选，任意云/VPS）

如选择自托管，可使用已提供的 Dockerfile：

1) 构建镜像并推送：

```bash
docker build -t <your-registry>/reimbursement-api:latest -f apps/api/Dockerfile .
docker push <your-registry>/reimbursement-api:latest
```

2) 运行容器（Compose/K8s 同理）：

```bash
docker run -d --name reimbursement-api -p 8787:8787 \
  -e NODE_ENV=production \
  -e DATABASE_URL=... \
  -e JWT_ACCESS_SECRET=... \
  -e JWT_REFRESH_SECRET=... \
  -e JWT_ACCESS_TTL=15m \
  -e JWT_REFRESH_TTL=30d \
  -e S3_ENDPOINT=... -e S3_REGION=auto -e S3_ACCESS_KEY=... -e S3_SECRET_KEY=... -e S3_BUCKET=... \
  -e S3_PUBLIC_BASE_URL=... \
  -e CORS_ALLOWED_ORIGINS=https://m-reimburse.example.com \
  -e AUTH_RATE_LIMIT_WINDOW_MS=60000 \
  -e AUTH_RATE_LIMIT_MAX=10 \
  -e UPLOAD_MAX_BYTES=10485760 \
  -e UPLOAD_ALLOWED_MIME_TYPES=image/jpeg,image/png,application/pdf \
  -e UPLOAD_ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf \
  -e LOG_LEVEL=info \
  <your-registry>/reimbursement-api:latest
```

3) 健康检查：访问 `/health`（如 `https://api-reimburse.example.com/health`），期望 `{"status":"ok"}`。

---

## 3. 前端部署 (Vercel)

### 步骤 3.1：导入项目

1. Vercel Dashboard -> Add New Project -> 导入 `reimbursement`。
2. **Framework Preset**: `Next.js`。
3. **Root Directory**: 保持默认 `./` (由根目录 `vercel.json` 控制构建)。

### 步骤 3.2：环境变量

- 添加 `NEXT_PUBLIC_API_BASE` -> `https://api-reimburse.example.com/api/v1`
- 添加 `NEXT_PUBLIC_APP_URL`  -> 你的前端域名（与自定义域一致）

### 步骤 3.3：部署

- 点击 Deploy（仓库根目录已有 `vercel.json`，自动执行 `npm --workspace apps/web run build`）。
- 部署成功后，绑定自定义域名（如 `m-reimburse.example.com`）。

---

## 4. 后续配置与联调

### 4.1 更新 CORS

前端域名确定后（如 `m-reimburse.example.com`），**务必**在后端环境变量更新 `CORS_ALLOWED_ORIGINS`，否则前端会报跨域错误。

### 4.2 数据库迁移

首次部署/表结构变更后，需要迁移生产库（在本地执行，或在 CI/CD 中执行）：

```bash
export DATABASE_URL="你的生产数据库连接串"
npm run db:migrate         # 使用 Drizzle 迁移
# 或快速推送（开发用）：npm run db:push
```

---

## 5. CI/CD (GitHub Actions)

仓库内置了 `.github/workflows/ci.yml`，在 Push/PR 时自动运行：

- `npm run lint`
- `npm run typecheck`
- `npm run test`

建议在 GitHub 开启分支保护，强制要求 CI 通过才能合并代码。

---

## 6. 常见问题 (FAQ)

### Q: API 404 或 CORS 错误？

- 检查 `NEXT_PUBLIC_API_BASE` 是否包含 `/api/v1` 后缀。
- 检查后端的 `CORS_ALLOWED_ORIGINS` 是否完全匹配前端域名（https, 无末尾斜杠）。

### Q: 部署失败，找不到模块？

- 确认容器构建时的 Context 设为仓库根目录 `/`。
- 确认 Dockerfile 里的 `COPY` 路径正确（本项目已配置好）。

### Q: 上传文件失败？

- 检查 R2 相关的 S3 变量是否正确。
- 检查 `UPLOAD_ALLOWED_EXTENSIONS` 限制。
