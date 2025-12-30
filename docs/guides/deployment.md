# 报销系统部署指南（Vercel Web + Clawcloud API+Worker）

本指南按当前项目结构更新：

- **apps/web**：部署到 Vercel（静态 + SSR）
- **apps/api**：部署到 Clawcloud（常驻 Node 进程，内置 worker 轮询）

---

## 📋 项目架构

```
reimbursement/
├── apps/
│   ├── api/        # Hono API + 内置 worker
│   └── web/        # Next.js Web
└── packages/
    └── shared/     # 共享类型、schema、工具函数
```

---

## ✅ 推荐部署组合

- **Web**: Vercel（免费层足够）
- **API + Worker**: Clawcloud（常驻进程，支持后台任务）
- **数据库**: Supabase 或 Neon（免费 PostgreSQL）
- **对象存储**: Cloudflare R2（免费存储）

---

## 🧰 环境变量配置

### apps/web（Vercel）
只需要 2 个变量：

| 变量名 | 示例值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | `https://api.yourdomain.com/api/v1` | API 基础 URL（含 /api/v1） |
| `NEXT_PUBLIC_APP_URL` | `https://your-vercel-domain.vercel.app` | Web 地址 |

> 注意：`NEXT_PUBLIC_API_BASE` 必须是 API 域名，不再使用 Vercel rewrites。

### apps/api（Clawcloud）
必需变量：

| 变量名 | 示例值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | PostgreSQL 连接串 |
| `JWT_ACCESS_SECRET` | `随机32位以上密钥` | 访问令牌密钥 |
| `JWT_REFRESH_SECRET` | `随机32位以上密钥` | 刷新令牌密钥 |
| `S3_ENDPOINT` | `https://xxx.r2.cloudflarestorage.com` | R2 Endpoint |
| `S3_REGION` | `auto` | R2 区域 |
| `S3_ACCESS_KEY` | `xxx` | R2 Access Key |
| `S3_SECRET_KEY` | `xxx` | R2 Secret Key |
| `S3_BUCKET` | `reimbursement` | Bucket 名称 |
| `CORS_ALLOWED_ORIGINS` | `https://your-vercel-domain.vercel.app` | 允许的前端域名（逗号分隔） |
| `START_WORKER` | `true` | 开启内置 worker |

可选变量：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_ACCESS_TTL` | `900` | 访问令牌有效期（秒） |
| `JWT_REFRESH_TTL` | `2592000` | 刷新令牌有效期（秒） |
| `S3_PUBLIC_BASE_URL` | `""` | R2 公网域名（可选） |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` | 认证限流窗口（毫秒） |
| `AUTH_RATE_LIMIT_MAX` | `10` | 认证限流最大次数 |
| `UPLOAD_MAX_BYTES` | `10485760` | 上传最大字节数 |
| `UPLOAD_ALLOWED_MIME_TYPES` | `image/jpeg,image/png,application/pdf` | 允许的 MIME 类型 |
| `UPLOAD_ALLOWED_EXTENSIONS` | `jpg,jpeg,png,pdf` | 允许的文件扩展名 |
| `LOG_LEVEL` | `info` | 日志级别（debug/info/warn/error） |
| `PORT` | `8787` | API 端口 |

---

## 🚀 部署步骤

### 1) 准备数据库（Supabase/Neon）

创建 PostgreSQL，并拿到 `DATABASE_URL`（建议开启 `sslmode=require`）。

### 2) 准备对象存储（Cloudflare R2）

创建 Bucket 并获取以下变量：

- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- （可选）`S3_PUBLIC_BASE_URL`

### 3) 部署 API + Worker 到 Clawcloud

下面以「从 Git 仓库自动构建 + 常驻运行」为例（界面文案可能略有差异，但需要配置项基本一致）。

#### 3.1 创建服务

1. 在 Clawcloud 控制台新建一个 **应用/服务**（Node.js/Container 均可）
2. 绑定你的 Git 仓库（GitHub/GitLab）
3. 选择分支（通常是 `main`）
4. 运行时选择 Node.js（建议 Node 20）

#### 3.2 配置构建与启动

有两种配置方式，任选其一：

> 依赖安装建议优先用 `npm ci`（更稳定、复现性更好）。如果平台不支持再用 `npm install`。  
> 如果你在构建阶段遇到 “找不到 tsc/tsx” 之类报错，通常是平台在安装依赖时省略了 devDependencies：请在平台中开启“安装 devDependencies”，或设置 `NPM_CONFIG_PRODUCTION=false`。

**方式 A（推荐）：工作目录为仓库根目录**

- **Install Command**
  ```bash
  npm ci
  ```
- **Build Command**
  ```bash
  npm --workspace apps/api run build
  ```
- **Start Command**
  ```bash
  node apps/api/dist/server.js
  ```

**方式 B：工作目录设为 `apps/api`**

- **Install Command**
  ```bash
  npm ci
  ```
- **Build Command**
  ```bash
  npm run build
  ```
- **Start Command**
  ```bash
  node dist/server.js
  ```

#### 3.2.1 Clawcloud 配置项对照（你应该能在控制台找到这些字段）

- **Repository / Source**：选择你的代码仓库
- **Branch**：`main`
- **Working Directory（可选）**：不设置（用方式 A）或设置为 `apps/api`（用方式 B）
- **Install Command**：`npm ci`（或 `npm install`）
- **Build Command**：见上方方式 A/B
- **Start Command**：见上方方式 A/B
- **Environment Variables**：按本项目变量表配置（至少含 `DATABASE_URL`、JWT、S3、`START_WORKER`、`CORS_ALLOWED_ORIGINS`）
- **Port / Container Port**：`8787`（如果平台强制指定内部端口）
- **Health Check Path（可选）**：`/health`
- **Instances / Replicas**：建议 `1` 起步

#### 3.3 配置端口与健康检查

- 端口：本项目读取 `PORT`（未设置时默认 `8787`）。如果 Clawcloud 会自动注入 `PORT`（常见做法），不要手动覆盖；否则设置 `PORT=8787` 并把服务的“容器端口/内部端口”设为 `8787`。
- 健康检查（如平台支持）：Path 设为 `/health`，期望返回 `{"status":"ok"}`。
- 实例数：建议先保持 1 个实例；后续需要扩容时再调整（后台任务使用数据库锁避免重复处理）。

#### 3.4 配置环境变量（Clawcloud）

在 Clawcloud 的环境变量设置中添加本项目需要的变量（参考上方表格）。强烈建议额外设置：

- `NODE_ENV=production`
- `START_WORKER=true`（启动内置 worker 轮询，处理导出/批次检查等后台任务）
- `CORS_ALLOWED_ORIGINS=https://<你的 Vercel 域名>`（生产环境必须配置）

> `CORS_ALLOWED_ORIGINS` 支持逗号分隔多个来源，例如同时支持自定义域名与 Vercel 域名：  
> `https://yourdomain.com,https://your-vercel-domain.vercel.app`

最小可用配置（可直接对照 `apps/api/.env.example` 填写）：

- `DATABASE_URL=...`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `S3_ENDPOINT=...`
- `S3_REGION=auto`
- `S3_ACCESS_KEY=...`
- `S3_SECRET_KEY=...`
- `S3_BUCKET=...`
- `CORS_ALLOWED_ORIGINS=...`
- `START_WORKER=true`
- `NODE_ENV=production`

#### 3.5 发布与观察

1. 触发一次部署（首次创建服务通常会自动部署）
2. 在 Clawcloud 查看构建日志，确认 `tsc` 构建成功
3. 在运行日志中确认出现 `API running on http://localhost:<PORT>`，以及（当 `START_WORKER=true`）出现 `worker.started`

### 4) 部署 Web 到 Vercel

1. 导入仓库到 Vercel
2. 设置环境变量：
   - `NEXT_PUBLIC_API_BASE`
   - `NEXT_PUBLIC_APP_URL`
3. 部署完成后记录 Vercel 域名

### 5) 配置域名（可选）

如果你有自定义域名：

- Web：CNAME 指向 `cname.vercel-dns.com`
- API：CNAME 指向 Clawcloud 提供的域名

然后把 `NEXT_PUBLIC_API_BASE` 和 `CORS_ALLOWED_ORIGINS` 更新为你的自定义域名。

### 6) 数据库迁移

部署前/后均可执行一次迁移：

```bash
export DATABASE_URL="你的生产数据库连接串"
npm run db:push
```

---

## ✅ 部署验证

```bash
# Web
https://your-vercel-domain.vercel.app

# API 健康检查
curl -v https://api.yourdomain.com/health

# 登录接口
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

## 🔒 安全与配置建议

- **CORS**：生产环境必须配置 `CORS_ALLOWED_ORIGINS`，不要用 `*`
- **JWT 密钥**：至少 32 位随机字符串，且 access/refresh 不同
- **上传限制**：按实际需求调整 `UPLOAD_MAX_BYTES` 与 MIME/扩展名白名单
- **日志级别**：生产建议 `info`，排查问题时临时调为 `debug`

---

## 🧯 常见问题

### 1) API 404 或跨域错误

检查：

- `NEXT_PUBLIC_API_BASE` 是否指向正确的 API 域名
- `CORS_ALLOWED_ORIGINS` 是否包含 Web 域名

### 2) worker 没有运行

确认：

- `START_WORKER=true`
- Clawcloud 使用 `node apps/api/dist/server.js` 启动

### 3) 上传失败

检查：

- R2 凭证是否正确
- `UPLOAD_ALLOWED_MIME_TYPES` / `UPLOAD_ALLOWED_EXTENSIONS` 是否包含对应类型

---

如果你把 Clawcloud 的服务创建页面截图（或把可选项标题发我），我可以把上面的步骤进一步对齐到你看到的具体字段名称。
