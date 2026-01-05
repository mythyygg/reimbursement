# 报销系统部署指南 (Vercel + Clawcloud)

本指南针对 **前端 (Vercel)** + **后端 (Clawcloud)** 的部署组合，提供详细的操作步骤与最佳实践。

---

## 📋 项目架构

- **前端 (Web)**: Next.js -> Vercel (静态 + SSR)
- **后端 (API)**: Hono -> Clawcloud (推荐 Docker 容器化部署)
- **数据库**: PostgreSQL (Supabase/Neon)
- **对象存储**: Cloudflare R2
- **CI/CD**: GitHub Actions (自动检查) + Vercel/Clawcloud (自动部署)

---

## 🌐 生产环境信息

你当前使用的生产域名（示例）：

- **Web (Vercel)**: `https://m-reimburse.caicaizi.xyz.xyz`
- **API (Clawcloud)**: `https://i-reimburse.caicaizi.xyz`

---

## 1. 准备工作：环境变量

在开始部署前，请准备好以下关键凭证。

### 后端变量 (API - Clawcloud)

| 变量名                 | 说明                 | 示例/备注                                                            |
| :--------------------- | :------------------- | :------------------------------------------------------------------- |
| `DATABASE_URL`         | 数据库连接串         | 建议开启连接池模式 (`?sslmode=require`)                              |
| `JWT_ACCESS_SECRET`    | Token 签名密钥       | 随机生成的长字符串 (32 位以上)                                       |
| `JWT_REFRESH_SECRET`   | 刷新 Token 密钥      | 随机生成的长字符串                                                   |
| `S3_ENDPOINT`          | R2/S3 接口地址       | `https://<accountid>.r2.cloudflarestorage.com`                       |
| `S3_ACCESS_KEY`        | R2 Access Key ID     |                                                                      |
| `S3_SECRET_KEY`        | R2 Secret Access Key |                                                                      |
| `S3_BUCKET`            | 存储桶名称           | e.g. `reimbursement`                                                 |
| `S3_REGION`            | 区域                 | R2 填 `auto`                                                         |
| `CORS_ALLOWED_ORIGINS` | 允许的前端域名       | 生产环境必需。例如 `https://m-reimburse.caicaizi.xyz.xyz` (逗号分隔) |
| `START_WORKER`         | 启动后台任务         | 填 `true`                                                            |
| `NODE_ENV`             | 环境                 | 填 `production`                                                      |

### 前端变量 (Web - Vercel)

| 变量名                 | 说明     | 示例                                                       |
| :--------------------- | :------- | :--------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE` | API 地址 | `https://i-reimburse.caicaizi.xyz/api/v1` (需带 `/api/v1`) |

---

## 2. 后端部署 (Clawcloud)

推荐使用 **Docker** 方式部署，完美支持 Monorepo 依赖结构。

### 步骤 2.1：新建服务

1. 登录 Clawcloud 控制台，创建 **Application** (Service)。
2. 连接 GitHub 仓库 `reimbursement`，分支 `main`。

### 步骤 2.2：构建配置 (Docker)

- **Deploy Mode**: `Docker`
- **Dockerfile Path**: `apps/api/Dockerfile`
- **Context Directory**: `/` (根目录，**关键点**：否则无法读取 shared 包)
- **Exposed Port**: `8787`

### 步骤 2.3：填入环境变量

将上方准备的 "后端变量" 全部填入 Clawcloud 配置页。

### 步骤 2.4：部署与验证

- 部署完成后，访问 `/health` 端点（如 `https://i-reimburse.caicaizi.xyz/health`）。
- 期望返回：`{"status":"ok"}`。
- 查看日志确认 `worker.started` 出现（如果开启了 worker）。

---

## 3. 前端部署 (Vercel)

### 步骤 3.1：导入项目

1. Vercel Dashboard -> Add New Project -> 导入 `reimbursement`。
2. **Framework Preset**: `Next.js`。
3. **Root Directory**: 保持默认 `./` (由根目录 `vercel.json` 控制构建)。

### 步骤 3.2：环境变量

- 添加 `NEXT_PUBLIC_API_BASE` -> `https://i-reimburse.caicaizi.xyz/api/v1`

### 步骤 3.3：部署

- 点击 Deploy。
- 部署成功后，绑定自定义域名（如 `m-reimburse.caicaizi.xyz.xyz`）。

---

## 4. 后续配置与联调

### 4.1 更新 CORS

前端域名确定后（如 `m-reimburse.caicaizi.xyz.xyz`），**务必**回到 Clawcloud 更新 `CORS_ALLOWED_ORIGINS`，否则前端会报跨域错误。

### 4.2 数据库迁移

部署后数据库可能为空，需在本地执行迁移推送到生产库：

```bash
export DATABASE_URL="你的生产数据库连接串"
npm run db:push
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
- 检查 Clawcloud 的 `CORS_ALLOWED_ORIGINS` 是否完全匹配前端域名（https, 无末尾斜杠）。

### Q: 部署失败，找不到模块？

- 确认 Clawcloud 的 Build Context 设为了根目录 `/`。
- 确认 Dockerfile 里的 `COPY` 路径正确（本项目已配置好）。

### Q: 上传文件失败？

- 检查 R2 相关的 S3 变量是否正确。
- 检查 `UPLOAD_ALLOWED_EXTENSIONS` 限制。
