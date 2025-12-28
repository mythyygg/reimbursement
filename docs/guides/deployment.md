# 报销系统部署指南

## 📋 项目架构

本项目采用 Monorepo 结构，包含三个应用：

- **apps/web** - Next.js 前端（PWA）
- **apps/api** - Hono API 后端
- **apps/worker** - 后台任务处理器

## 🌐 线上环境

- **前端域名**: baoxiao.caicaizi.xyz
- **后端 API 域名**: api-reimburse.caicaizi.xyz（或通过前端域名的 /api 路由访问）

---

## ⚙️ 环境变量配置说明

### Monorepo 最佳实践

本项目采用 **各应用独立管理环境变量** 的方式，而非根目录统一管理：

```
reimbursement/
└── apps/
    ├── api/
    │   ├── .env.example      # 示例文件（已提交）
    │   └── .env.local        # 本地开发配置（不提交，需自行创建）
    └── web/
        ├── .env.example      # 示例文件（已提交）
        └── .env.local        # 本地开发配置（不提交，需自行创建）
```

**优势：**
- ✅ 配置隔离，避免变量冲突
- ✅ 每个应用独立管理自己的配置
- ✅ 符合 Monorepo 最佳实践

### 本地开发配置

**首次使用需要创建环境变量文件：**

```bash
# API 应用
cd apps/api
cp .env.example .env.local
# 编辑 .env.local，填写实际配置

# Web 应用
cd apps/web
cp .env.example .env.local
# 编辑 .env.local，填写实际配置
```

**详细配置说明请参考：** [ENV_MIGRATION_GUIDE.md](./ENV_MIGRATION_GUIDE.md)

### 环境变量文件优先级

**API 应用（apps/api）：**
1. `.env.{NODE_ENV}.local` （如 .env.development.local）
2. `.env.{NODE_ENV}` （如 .env.development）
3. `.env.local`
4. `.env`

**Web 应用（apps/web）：**
- Next.js 自动从 `apps/web` 目录加载，优先级同上

---

## 🚀 推荐部署方案

### 方案对比

| 方案 | 平台 | 优势 | 免费额度 | 推荐度 |
|------|------|------|----------|--------|
| **A: Vercel 统一部署** | Vercel | 前后端统一管理，配置简单 | 100GB 带宽/月 | ⭐⭐⭐⭐⭐ |
| **B: Cloudflare Workers** | Cloudflare | 极快冷启动，全球分发 | 100K 请求/天 | ⭐⭐⭐⭐ |
| **C: Railway 部署** | Railway | 传统 Node.js，配置灵活 | $5/月 额度 | ⭐⭐⭐ |
| **D: Render 部署** | Render | 简单易用 | 750 小时/月 | ⭐⭐ |

**推荐**: 方案 A（Vercel 统一部署）- 最简单，最适合此项目

---

## 📦 方案 A: Vercel 统一部署（推荐）

### 为什么选择 Vercel？

- ✅ 前后端统一平台，一次部署
- ✅ 自动 HTTPS、CDN 加速
- ✅ Git 集成，Push 即部署
- ✅ 免费额度充足（100GB 带宽/月，100GB-hours 计算时间）
- ✅ 自定义域名支持

### 前置准备

#### 1. 数据库（PostgreSQL）

推荐使用 **Supabase** 或 **Neon**，两者都提供免费的 PostgreSQL 数据库：

**Supabase（推荐）**
- 官网: https://supabase.com
- 免费额度: 500MB 存储，2GB 带宽/月
- 优势: 提供完整的后端服务（数据库、认证、存储、实时订阅）

**Neon**
- 官网: https://neon.tech
- 免费额度: 0.5GB 存储，无限查询
- 优势: Serverless PostgreSQL，冷启动快

**注册步骤：**
1. 访问上述任一平台并注册
2. 创建新项目
3. 获取数据库连接字符串（`DATABASE_URL`）

格式示例：
```
postgresql://user:password@host.region.aws.neon.tech:5432/database?sslmode=require
```

#### 2. 对象存储（Cloudflare R2）

**为什么使用 R2？**
- 免费额度: 10GB 存储，1000 万次写入/月，1 亿次读取/月
- S3 兼容，无需修改代码
- 零出口流量费用（相比 AWS S3）

**配置步骤：**
1. 访问 https://dash.cloudflare.com 并登录
2. 进入 R2 Object Storage
3. 创建 Bucket（如：`reimbursement-receipts`）
4. 生成 API Token，获取以下信息：
   - `S3_ENDPOINT`: 如 `https://<账户ID>.r2.cloudflarestorage.com`
   - `S3_ACCESS_KEY`: API Token Access Key
   - `S3_SECRET_KEY`: API Token Secret Key
   - `S3_BUCKET`: Bucket 名称
5. （可选）配置自定义域名作为公开访问 URL（`S3_PUBLIC_BASE_URL`）

### 部署步骤

#### 步骤 1: 准备代码仓库

```bash
# 如果还没有 Git 仓库，初始化一个
git init
git add .
git commit -m "Initial commit"

# 推送到 GitHub
git remote add origin <你的 GitHub 仓库 URL>
git push -u origin main
```

#### 步骤 2: 导入项目到 Vercel

1. 访问 https://vercel.com 并登录（建议使用 GitHub 登录）
2. 点击 "Add New Project"
3. 导入你的 GitHub 仓库
4. Vercel 会自动检测到 `vercel.json` 配置文件

#### 步骤 3: 配置环境变量

在 Vercel 项目设置页面（Settings → Environment Variables），添加以下环境变量：

**必需的环境变量：**

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | 数据库连接字符串（从 Supabase/Neon 获取） |
| `JWT_ACCESS_SECRET` | `your-access-secret-key-32-chars-minimum` | JWT 访问令牌密钥（至少 32 字符） |
| `JWT_REFRESH_SECRET` | `your-refresh-secret-key-32-chars-minimum` | JWT 刷新令牌密钥（至少 32 字符） |
| `S3_ENDPOINT` | `https://xxx.r2.cloudflarestorage.com` | R2 端点地址 |
| `S3_REGION` | `auto` | R2 区域（固定为 `auto`） |
| `S3_ACCESS_KEY` | `your-r2-access-key` | R2 访问密钥 |
| `S3_SECRET_KEY` | `your-r2-secret-key` | R2 密钥 |
| `S3_BUCKET` | `reimbursement-receipts` | R2 Bucket 名称 |
| `NEXT_PUBLIC_API_BASE` | `https://baoxiao.caicaizi.xyz` | 前端 API 基础 URL |
| `NEXT_PUBLIC_APP_URL` | `https://baoxiao.caicaizi.xyz` | 前端应用 URL |

**可选的环境变量：**

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `JWT_ACCESS_TTL` | `900` | 访问令牌有效期（秒，默认 15 分钟） |
| `JWT_REFRESH_TTL` | `2592000` | 刷新令牌有效期（秒，默认 30 天） |
| `S3_PUBLIC_BASE_URL` | `""` | R2 自定义域名（用于生成公开 URL） |

**生成安全的密钥：**

```bash
# Mac/Linux 使用 openssl
openssl rand -base64 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 步骤 4: 配置自定义域名

1. 在 Vercel 项目设置中，点击 "Domains"
2. 添加你的域名：
   - 前端域名：`baoxiao.caicaizi.xyz`
   - （可选）API 域名：`api-reimburse.caicaizi.xyz`

3. 在你的 DNS 服务商（如 Cloudflare）添加 DNS 记录：

   **如果使用 Cloudflare DNS:**
   ```
   类型: CNAME
   名称: baoxiao
   目标: cname.vercel-dns.com
   代理状态: 仅 DNS（关闭橙色云朵）
   ```

   **如果要单独配置 API 域名:**
   ```
   类型: CNAME
   名称: api-reimburse
   目标: cname.vercel-dns.com
   ```

4. 等待 DNS 生效（通常 5-10 分钟）

#### 步骤 5: 部署

1. 在 Vercel 项目页面，点击 "Deploy"
2. Vercel 会自动：
   - 安装依赖
   - 构建前端（Next.js）
   - 打包后端 API（Serverless Functions）
   - 部署到全球 CDN
3. 部署完成后，访问你的域名测试

#### 步骤 6: 数据库迁移

部署完成后，需要初始化数据库表结构：

**方式一：本地运行迁移（推荐）**

```bash
# 设置生产环境数据库 URL
export DATABASE_URL="你的生产数据库连接字符串"

# 运行数据库迁移（推送表结构）
npm run db:push

# 或使用 Drizzle Studio 可视化管理
npm run db:studio
```

**方式二：使用 SQL 客户端**

如果你使用 Supabase，可以在 Supabase Dashboard 的 SQL Editor 中直接运行迁移 SQL。

### 验证部署

访问以下 URL 确认部署成功：

```bash
# 前端页面
https://baoxiao.caicaizi.xyz

# API 健康检查
https://baoxiao.caicaizi.xyz/health
# 预期响应: {"status":"ok"}

# API 测试（登录）
curl -X POST https://baoxiao.caicaizi.xyz/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### 自动部署

配置完成后，每次推送代码到 GitHub 的 `main` 分支，Vercel 会自动：
1. 触发新的构建
2. 运行测试（如果配置了）
3. 部署到生产环境
4. 无缝切换流量（零停机部署）

---

## 📦 方案 B: Cloudflare Workers 部署

### 优势
- ✅ 极快的冷启动（~10ms vs Vercel ~1s）
- ✅ 全球边缘节点分发（200+ 数据中心）
- ✅ 免费额度：每天 100,000 请求
- ✅ Hono 原生支持 Cloudflare Workers

### 限制
- ⚠️ 需要使用 HTTP-based PostgreSQL driver（如 `@neondatabase/serverless`）
- ⚠️ 不支持传统 Node.js `pg` 库的连接池

### 部署步骤（简要）

#### 1. 安装 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

#### 2. 修改数据库客户端

需要将 `pg` 替换为 `@neondatabase/serverless`：

```bash
cd apps/api
npm install @neondatabase/serverless
```

修改 `apps/api/src/db/client.ts`：
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@reimbursement/shared/db';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

#### 3. 创建 wrangler.toml
```toml
name = "reimbursement-api"
main = "apps/api/src/index.ts"
compatibility_date = "2024-01-01"

[vars]
JWT_ACCESS_TTL = "900"
JWT_REFRESH_TTL = "2592000"
```

#### 4. 部署
```bash
# 配置敏感环境变量
wrangler secret put DATABASE_URL
wrangler secret put JWT_ACCESS_SECRET
wrangler secret put JWT_REFRESH_SECRET
wrangler secret put S3_SECRET_KEY

# 部署
wrangler deploy
```

---

## 📦 方案 C: Railway 部署（传统方案）

> 如果你更喜欢传统的 Node.js 服务器部署方式，可以选择 Railway

### 为什么选择 Railway？
- ✅ 支持传统 Node.js 长连接应用
- ✅ 可以在一个项目中运行多个服务（API + Worker）
- ✅ 免费 $5/月 额度（约 500 小时运行时间）
- ✅ 自动 HTTPS，支持自定义域名

### 部署步骤（保留原有配置）

参考原有文档中的 Railway 配置（省略详细步骤）。

---

## 💰 成本估算对比

### 方案 A: Vercel 统一部署
| 服务 | 平台 | 费用 |
|------|------|------|
| Web 前端 | Vercel | 免费（100GB 带宽） |
| API 后端 | Vercel | 免费（100GB-hours） |
| 数据库 | Supabase | 免费（500MB 存储，2GB 带宽） |
| 对象存储 | Cloudflare R2 | 免费（10GB 存储） |
| **总计** | | **$0/月** 💰 |

### 方案 B: Cloudflare Workers
| 服务 | 平台 | 费用 |
|------|------|------|
| Web 前端 | Vercel | 免费 |
| API 后端 | Cloudflare Workers | 免费（100K 请求/天） |
| 数据库 | Neon | 免费 |
| 对象存储 | Cloudflare R2 | 免费 |
| **总计** | | **$0/月** 💰 |

### 方案 C: Railway
| 服务 | 平台 | 费用 |
|------|------|------|
| Web 前端 | Vercel | 免费 |
| API + Worker | Railway | 免费（$5 额度，约 500 小时） |
| 数据库 | Supabase | 免费 |
| 对象存储 | Cloudflare R2 | 免费 |
| **总计** | | **$0/月** 💰 |

---

## 🏗️ 推荐部署架构图

```
┌─────────────────────────────────────────────────────┐
│                   Vercel Platform                   │
│                                                     │
│  ┌──────────────────┐      ┌───────────────────┐  │
│  │  Next.js 前端    │      │  Hono API 后端    │  │
│  │  (SSG/SSR/ISR)   │◄─────┤  (Serverless)     │  │
│  │                  │      │                   │  │
│  │  • PWA 支持      │      │  • JWT 认证       │  │
│  │  • 离线缓存      │      │  • RESTful API    │  │
│  │  • 自动优化      │      │  • 文件上传       │  │
│  └────────┬─────────┘      └────────┬──────────┘  │
│           │                         │             │
└───────────┼─────────────────────────┼─────────────┘
            │                         │
            │          CDN            │
            │     (全球加速)          │
            ▼                         ▼
      ┌─────────┐             ┌──────────────┐
      │  用户   │             │  外部服务     │
      │  浏览器 │             └──────┬───────┘
      └─────────┘                    │
                                     ├─► Supabase (PostgreSQL)
                                     ├─► Cloudflare R2 (存储)
                                     └─► JWT 令牌验证
```

---

## 🔒 安全最佳实践

### 1. 环境变量管理
- ⚠️ **永远不要**将敏感信息提交到 Git 仓库
- ✅ 使用 `.env.local` 存储本地开发密钥
- ✅ 在 Vercel/Railway 后台配置生产环境变量
- ✅ 为不同环境使用不同的密钥

### 2. JWT 密钥强度
- ✅ 至少 32 字符长度
- ✅ 使用加密安全的随机生成器
- ✅ Access Token 和 Refresh Token 使用不同的密钥
- ✅ 定期轮换密钥（建议每 6 个月）

### 3. 数据库安全
- ✅ 启用 SSL 连接（`sslmode=require`）
- ✅ 使用数据库连接池（防止连接耗尽）
- ✅ 限制数据库访问 IP（如果平台支持）
- ✅ 定期备份数据（Supabase 提供自动备份）
- ✅ 使用只读用户进行查询操作（可选）

### 4. CORS 配置
生产环境建议限制 CORS 来源，修改 `apps/api/src/index.ts:88`：

```typescript
app.use("*", cors({
  origin: [
    "https://baoxiao.caicaizi.xyz",
    "https://api-reimburse.caicaizi.xyz"
  ],
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400 // 24 小时
}));
```

### 5. 文件上传安全
- ✅ 限制文件大小（如 10MB）
- ✅ 验证文件类型（仅允许图片）
- ✅ 扫描恶意文件（可选，使用第三方服务）
- ✅ 使用唯一文件名（UUID）
- ✅ 设置 R2 Bucket 访问策略

---

## 🐛 常见问题排查

### 1. 数据库连接超时

**症状**: `Error: connect ETIMEDOUT` 或 `connect ECONNREFUSED`

**可能原因**:
- DATABASE_URL 配置错误
- 数据库服务未启动
- 防火墙阻止连接
- Serverless 环境下连接池配置不当

**解决方案**:
```bash
# 1. 验证 DATABASE_URL 格式
echo $DATABASE_URL

# 2. 测试数据库连接
psql $DATABASE_URL -c "SELECT 1;"

# 3. 检查 Serverless 配置
# 确保使用 apps/api/src/db/client.serverless.ts
# 或者使用 HTTP-based driver (@neondatabase/serverless)

# 4. 检查数据库日志
# 在 Supabase/Neon 控制台查看连接日志
```

### 2. S3/R2 上传失败

**症状**: `AccessDenied` 或 `SignatureDoesNotMatch`

**可能原因**:
- S3 凭证错误
- Bucket 权限配置错误
- CORS 配置缺失
- 时钟不同步（导致签名失效）

**解决方案**:
```bash
# 1. 验证 S3 凭证
echo "Endpoint: $S3_ENDPOINT"
echo "Bucket: $S3_BUCKET"

# 2. 测试 S3 连接（使用 AWS CLI）
aws s3 ls \
  --endpoint-url $S3_ENDPOINT \
  --region auto \
  s3://$S3_BUCKET

# 3. 检查 R2 CORS 配置
# 在 Cloudflare Dashboard → R2 → Bucket Settings → CORS
# 添加规则：
# - AllowedOrigins: https://baoxiao.caicaizi.xyz
# - AllowedMethods: GET, PUT, POST, DELETE
# - AllowedHeaders: *

# 4. 同步系统时钟
sudo ntpdate -s time.apple.com  # Mac
sudo ntpdate -s pool.ntp.org    # Linux
```

### 3. JWT 验证失败

**症状**: `401 Unauthorized` 或 `Invalid token`

**可能原因**:
- JWT 密钥不一致
- Token 已过期
- Token 格式错误
- 环境变量未正确设置

**解决方案**:
```bash
# 1. 检查环境变量
echo "JWT_ACCESS_SECRET 长度: ${#JWT_ACCESS_SECRET}"
echo "JWT_REFRESH_SECRET 长度: ${#JWT_REFRESH_SECRET}"
# 两者都应该 >= 32

# 2. 验证 Token 格式
# 使用 jwt.io 解码 Token，检查：
# - header.alg 是否为 HS256
# - payload.exp 是否未过期
# - payload.userId 是否存在

# 3. 重新生成 Token
curl -X POST https://baoxiao.caicaizi.xyz/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 4. 检查前端存储
# 打开浏览器控制台：
localStorage.getItem('accessToken')
```

### 4. Vercel 部署失败

**症状**: Build Error 或 Deployment Failed

**可能原因**:
- 依赖安装失败
- TypeScript 编译错误
- 环境变量缺失
- 构建超时

**解决方案**:
```bash
# 1. 本地测试构建
npm install
npm run build

# 2. 检查 Vercel 日志
# 在 Vercel Dashboard → Deployments → 查看详细日志

# 3. 验证 vercel.json 配置
cat vercel.json

# 4. 检查依赖版本
npm ls

# 5. 清理并重新构建
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 5. API 路由 404

**症状**: 前端调用 API 返回 404

**可能原因**:
- Vercel rewrites 配置错误
- API 路由路径不匹配
- CORS 阻止请求

**解决方案**:
```bash
# 1. 检查 vercel.json rewrites 配置
cat vercel.json | grep -A 5 "rewrites"

# 2. 测试 API 路由
curl -v https://baoxiao.caicaizi.xyz/health
curl -v https://baoxiao.caicaizi.xyz/api/v1/auth/login

# 3. 检查浏览器控制台
# Network 标签查看请求详情

# 4. 验证前端 API 配置
echo $NEXT_PUBLIC_API_BASE
```

---

## 📚 参考资源

### 官方文档
- [Vercel 文档](https://vercel.com/docs)
- [Hono 文档](https://hono.dev)
- [Next.js 文档](https://nextjs.org/docs)
- [Drizzle ORM 文档](https://orm.drizzle.team)

### 平台文档
- [Supabase 文档](https://supabase.com/docs)
- [Neon 文档](https://neon.tech/docs)
- [Cloudflare R2 文档](https://developers.cloudflare.com/r2)
- [Railway 文档](https://docs.railway.app)

### 相关技术
- [PostgreSQL 文档](https://www.postgresql.org/docs)
- [JWT 最佳实践](https://datatracker.ietf.org/doc/html/rfc8725)
- [S3 API 参考](https://docs.aws.amazon.com/AmazonS3/latest/API)

---

## 🎯 下一步行动

### 快速开始（推荐 Vercel 方案）

1. **注册服务**（15 分钟）
   - [ ] 注册 Vercel 账号
   - [ ] 注册 Supabase 账号
   - [ ] 注册 Cloudflare 账号

2. **配置服务**（30 分钟）
   - [ ] 创建 Supabase 数据库，获取 DATABASE_URL
   - [ ] 创建 Cloudflare R2 Bucket，获取 S3 凭证
   - [ ] 生成 JWT 密钥

3. **部署应用**（15 分钟）
   - [ ] 推送代码到 GitHub
   - [ ] 在 Vercel 导入项目
   - [ ] 配置环境变量
   - [ ] 触发部署

4. **配置域名**（10 分钟）
   - [ ] 在 Vercel 添加自定义域名
   - [ ] 在 DNS 服务商添加 CNAME 记录
   - [ ] 等待 DNS 生效

5. **初始化数据**（5 分钟）
   - [ ] 运行数据库迁移
   - [ ] 创建测试用户
   - [ ] 验证功能

**总耗时**: 约 75 分钟 ⏱️

---

## ✅ 部署检查清单

### 部署前
- [ ] 代码已推送到 GitHub
- [ ] 所有环境变量已准备好
- [ ] 数据库已创建
- [ ] R2 Bucket 已创建
- [ ] JWT 密钥已生成（至少 32 字符）

### 部署中
- [ ] Vercel 项目已创建
- [ ] 环境变量已配置
- [ ] 自定义域名已添加
- [ ] DNS 记录已配置
- [ ] 部署状态为 "Ready"

### 部署后
- [ ] 前端页面可访问
- [ ] /health 端点返回 {"status":"ok"}
- [ ] 数据库迁移已运行
- [ ] 用户可以注册/登录
- [ ] 文件上传功能正常
- [ ] 自动部署流程测试通过

---

## 💬 需要帮助？

如果遇到问题，可以：
1. 查阅本文档的「常见问题排查」部分
2. 检查 Vercel 部署日志
3. 查看浏览器控制台错误
4. 参考官方文档
5. 提交 GitHub Issue

**祝部署顺利！🚀**
