# 环境配置说明

## 📁 配置文件结构

```
reimbursement/
├── .env.development      # 开发环境配置（本地）
├── .env.production       # 生产环境配置（云服务）
├── .env.example          # 配置模板
└── apps/web/
    └── .env.local        # Web 应用配置（API 地址等）
```

## 🎯 环境区分

### 开发环境（Development）

**使用场景**：本地开发和测试

**配置文件**：`.env.development`

**服务配置**：
- **数据库**：本地 PostgreSQL (`localhost:5432`)
- **对象存储**：本地 MinIO (`192.168.1.88:9000`)
- **API 地址**：`http://192.168.1.88:8787`

**启动命令**：
```bash
npm run dev
# Next.js 自动加载 .env.development
```

### 生产环境（Production）

**使用场景**：线上部署

**配置文件**：`.env.production`

**服务配置**：
- **数据库**：Neon PostgreSQL（需配置）
- **对象存储**：Cloudflare R2
- **API 地址**：生产域名（需配置）

**部署方式**：
在部署平台（Vercel/Railway/Render）设置环境变量，或使用 `.env.production`

## 🔄 环境切换

### Next.js 自动加载规则

Next.js 会根据运行命令自动选择配置文件：

```bash
# 开发环境
npm run dev
→ 加载 .env.development

# 生产构建
npm run build
→ 加载 .env.production

# 生产运行
npm start
→ 加载 .env.production
```

### 加载优先级

从高到低：
1. `.env.local` - 本地覆盖（所有环境，不提交 git）
2. `.env.development` / `.env.production` - 特定环境
3. `.env` - 所有环境共享（已删除，不推荐）

## ⚙️ 配置对比

| 配置项 | 开发环境 | 生产环境 |
|--------|---------|---------|
| **数据库** | 本地 PostgreSQL | Neon |
| **对象存储** | MinIO (本地) | Cloudflare R2 |
| **API 端口** | 8787 | 生产域名 |
| **Web 端口** | 3001 | 生产域名 |
| **JWT Secret** | 开发密钥 | **强随机密钥** ⚠️ |

## 📝 配置清单

### 开发环境启动前

- [ ] 本地 PostgreSQL 已启动
  ```bash
  brew services start postgresql
  # 或 docker-compose up -d postgres
  ```

- [ ] 本地 MinIO 已启动（可选）
  ```bash
  docker-compose up -d minio
  # 或访问 http://192.168.1.88:9000
  ```

- [ ] 检查 `.env.development` 配置正确
  ```bash
  cat .env.development
  ```

- [ ] 启动开发服务器
  ```bash
  npm run dev
  ```

### 生产环境部署前

- [ ] 配置 Neon 数据库
  - 参考：`NEON_DATABASE_SETUP.md`
  - 更新 `DATABASE_URL`

- [ ] 配置 Cloudflare R2
  - 参考：`CLOUDFLARE_R2_SETUP.md`
  - 已配置 ✅

- [ ] 生成强 JWT 密钥
  ```bash
  openssl rand -base64 32
  # 替换 JWT_ACCESS_SECRET 和 JWT_REFRESH_SECRET
  ```

- [ ] 更新生产域名
  - 更新 `NEXT_PUBLIC_API_BASE`
  - 更新 `NEXT_PUBLIC_APP_URL`

- [ ] 在部署平台设置环境变量
  - 复制 `.env.production` 中的所有变量
  - 在 Vercel/Railway/Render 中逐个设置

## 🔐 安全注意事项

### ⚠️ 不要提交的文件

已在 `.gitignore` 中配置：
```gitignore
.env
.env.*
!.env.example
```

**确保以下文件不会提交到 git**：
- `.env.development` - 包含本地配置
- `.env.production` - 包含生产密钥
- `.env.local` - 个人覆盖配置

### ✅ 可以提交的文件

- `.env.example` - 配置模板（不包含实际值）

### 🔑 敏感信息

以下配置包含敏感信息，务必保密：
- `DATABASE_URL` - 数据库密码
- `S3_SECRET_KEY` - S3 密钥
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` - JWT 密钥

## 🚀 快速开始

### 首次使用

1. **复制配置模板**
   ```bash
   # 已有 .env.development 和 .env.production
   # 无需操作
   ```

2. **启动开发环境**
   ```bash
   # 启动 PostgreSQL
   brew services start postgresql

   # 启动应用
   npm run dev
   ```

3. **访问应用**
   - Web: http://192.168.1.88:3001
   - API: http://192.168.1.88:8787

### 切换到生产环境测试

```bash
# 方法 1：临时使用生产配置
NODE_ENV=production npm run dev

# 方法 2：构建生产版本
npm run build
npm start
```

## 📊 完整服务栈

### 开发环境

```
┌─────────────────┐
│  Web (3001)     │
│  Next.js        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API (8787)     │
│  Hono + Drizzle │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬────────────┐
    │         │          │            │
    ▼         ▼          ▼            ▼
┌──────┐  ┌──────┐   ┌─────────┐
│ PG   │  │MinIO │   │ Worker  │
│ :5432│  │ :9000│   │         │
└──────┘  └──────┘   └─────────┘
```

### 生产环境

```
┌─────────────────┐
│  Web (Vercel)   │
│  Next.js        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API (Railway)  │
│  Hono + Drizzle │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬────────────┐
    │         │          │            │
    ▼         ▼          ▼            ▼
┌─────────┐ ┌────┐   ┌─────────┐
│  Neon   │ │ R2 │   │ Worker  │
│   PG    │ │ CF │   │Railway  │
└─────────┘ └────┘   └─────────┘
```

## 💡 提示

### 使用 .env.local 覆盖配置

如果需要临时修改某些配置（不提交到 git）：

```bash
# 创建 .env.local
cp .env.development .env.local

# 修改需要覆盖的配置
nano .env.local

# .env.local 的优先级高于 .env.development
npm run dev
```

### 检查当前使用的配置

在代码中打印环境变量：
```typescript
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('S3_ENDPOINT:', process.env.S3_ENDPOINT);
```

## 📚 相关文档

- `NEON_DATABASE_SETUP.md` - Neon 数据库配置指南

## 🔧 故障排查

### 环境变量未加载

**问题**：配置没有生效

**解决**：
1. 检查文件名是否正确（`.env.development` 或 `.env.production`）
2. 重启开发服务器
3. 清除 Next.js 缓存：`rm -rf .next`

### 数据库连接失败

**问题**：`ECONNREFUSED ::1:5432`

**解决**：
```bash
# 检查 PostgreSQL 是否运行
brew services list | grep postgresql

# 启动 PostgreSQL
brew services start postgresql
```

### MinIO 连接失败

**问题**：无法访问 MinIO

**解决**：
1. 检查 MinIO 是否运行：访问 http://192.168.1.88:9000
2. 检查防火墙设置
3. 或切换到 Cloudflare R2

### R2/S3 上传 CORS 错误

**问题**：上传票据时提示 CORS 策略阻止（Blocked by CORS policy）

**解决**：
需要在 Cloudflare R2 存储桶设置中添加 CORS 策略：
1. 进入 Cloudflare 控制台 -> R2 -> 你的存储桶 -> 设置 (Settings)
2. 找到 CORS 策略 (CORS Policy) -> 添加 (Add CORS Policy)
3. 填入以下配置并保存：
```json
[
  {
    "AllowedOrigins": ["http://localhost:3001"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```
*注意：生产环境下，请将 `http://localhost:3001` 替换为你的实际应用域名。*

## ✅ 完成清单

- [x] 创建 `.env.development`（开发环境）
- [x] 创建 `.env.production`（生产环境）
- [x] 创建 `.env.example`（配置模板）
- [x] 删除冗余的 `.env` 和 `.env.local`
- [x] 配置 Cloudflare R2（生产环境）
- [ ] 配置 Neon 数据库（生产环境）
- [ ] 生成强 JWT 密钥（生产环境）
- [ ] 更新生产域名（部署时）
