# 环境变量配置迁移指南

## 📋 变更说明

### 旧方式（根目录统一管理）❌
```
reimbursement/
├── .env.development          # 所有应用共享
├── .env.production           # 所有应用共享
└── apps/
    ├── api/
    └── web/
```

**问题：**
- ❌ 前后端环境变量混在一起
- ❌ 容易产生变量冲突
- ❌ 难以独立管理各应用配置

### 新方式（各应用独立管理）✅
```
reimbursement/
└── apps/
    ├── api/
    │   ├── .env.example      # 示例文件（提交到 Git）
    │   ├── .env.local        # 本地开发配置（不提交）
    │   ├── .env.development  # 开发环境配置（可选）
    │   └── .env.production   # 生产环境配置（可选）
    └── web/
        ├── .env.example      # 示例文件（提交到 Git）
        ├── .env.local        # 本地开发配置（不提交）
        ├── .env.development  # 开发环境配置（可选）
        └── .env.production   # 生产环境配置（可选）
```

**优势：**
- ✅ 配置隔离，避免冲突
- ✅ 每个应用独立管理
- ✅ 符合 Monorepo 最佳实践

---

## 🔄 迁移步骤

### 步骤 1: 创建新的环境变量文件

#### 1.1 创建 API 环境变量文件

```bash
cd apps/api

# 复制示例文件
cp .env.example .env.local

# 编辑配置
# 从根目录的 .env.development 中复制以下变量：
# - DATABASE_URL
# - S3_ENDPOINT
# - S3_REGION
# - S3_ACCESS_KEY
# - S3_SECRET_KEY
# - S3_BUCKET
# - S3_PUBLIC_BASE_URL
# - JWT_ACCESS_SECRET
# - JWT_REFRESH_SECRET
# - JWT_ACCESS_TTL
# - JWT_REFRESH_TTL
# - PORT
```

**apps/api/.env.local 示例内容：**
```bash
# 数据库
DATABASE_URL=postgresql://neondb_owner:npg_nAPOshGbtv06@ep-twilight-bread-a131alvt-pooler.ap-southeast-1.aws.neon.tech/reimbursement?sslmode=require&channel_binding=require

# S3 存储
S3_ENDPOINT=https://3ed6e33a4fe9e43f8129d4e81941b590.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=5b13ee774737f6f28edc90c78fdba797
S3_SECRET_KEY=e6bf9f8b88db0b303755e9d07440c2092a08f2dd882943ebd653d87706aeff0f
S3_BUCKET=reimbursement
S3_PUBLIC_BASE_URL=https://s3-cf.caicaizi.xyz

# JWT
JWT_ACCESS_SECRET=change-me-access
JWT_REFRESH_SECRET=change-me-refresh
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# 应用
PORT=8787
NODE_ENV=development
```

#### 1.2 创建 Web 环境变量文件

```bash
cd apps/web

# 复制示例文件
cp .env.example .env.local

# 编辑配置
# 从根目录的 .env.development 中复制以下变量：
# - NEXT_PUBLIC_API_BASE
# - NEXT_PUBLIC_APP_URL
```

**apps/web/.env.local 示例内容：**
```bash
# API 地址
NEXT_PUBLIC_API_BASE=http://localhost:8787/api/v1

# 应用地址
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### 步骤 2: 验证配置

#### 2.1 验证 API 启动

```bash
cd apps/api
npm run dev
```

检查日志：
- ✅ 数据库连接成功
- ✅ API 启动在正确的端口（如 8787）
- ❌ 如果报错 "DATABASE_URL is not set"，检查 .env.local 文件

#### 2.2 验证 Web 启动

```bash
cd apps/web
npm run dev
```

打开浏览器控制台，检查：
- ✅ API 请求发送到正确的地址
- ✅ 没有 CORS 错误
- ❌ 如果 API 地址错误，检查 .env.local 文件

### 步骤 3: 清理旧文件（可选）

迁移成功后，可以删除根目录的环境变量文件：

```bash
cd ../../  # 回到根目录

# 备份旧文件（以防万一）
mkdir -p .env-backup
mv .env.development .env-backup/
mv .env.production .env-backup/

# 确认应用正常运行后，删除备份
# rm -rf .env-backup
```

---

## 🔍 常见问题

### Q1: API 启动报错 "DATABASE_URL is not set"

**原因：** apps/api/.env.local 文件不存在或未配置 DATABASE_URL

**解决：**
```bash
cd apps/api
cp .env.example .env.local
# 编辑 .env.local，添加 DATABASE_URL
```

### Q2: 前端无法连接到 API

**原因：** apps/web/.env.local 未配置或 NEXT_PUBLIC_API_BASE 错误

**解决：**
```bash
cd apps/web
cat .env.local  # 检查配置

# 确保配置正确
echo "NEXT_PUBLIC_API_BASE=http://localhost:8787/api/v1" >> .env.local

# 重启开发服务器
npm run dev
```

### Q3: 为什么 Next.js 不需要特殊配置？

**答：** Next.js 默认会从项目根目录（apps/web）自动加载 .env 文件，按以下优先级：
1. `.env.${NODE_ENV}.local`
2. `.env.local`
3. `.env.${NODE_ENV}`
4. `.env`

不需要像 API 那样手动加载。

### Q4: 生产环境如何配置？

**Vercel 部署：**
- 在 Vercel Dashboard → Settings → Environment Variables 配置
- 不需要提交 .env 文件到 Git

**Railway/Render 部署：**
- 在平台控制台配置环境变量
- 或在 apps/api 创建 .env.production（不提交到 Git）

---

## ✅ 迁移检查清单

### API 应用
- [ ] 创建 apps/api/.env.local
- [ ] 配置 DATABASE_URL
- [ ] 配置 S3 相关变量
- [ ] 配置 JWT 密钥
- [ ] 启动 API 服务，验证无错误

### Web 应用
- [ ] 创建 apps/web/.env.local
- [ ] 配置 NEXT_PUBLIC_API_BASE
- [ ] 配置 NEXT_PUBLIC_APP_URL
- [ ] 启动 Web 服务，验证 API 连接正常

### 清理工作
- [ ] 备份根目录的旧 .env 文件
- [ ] 确认新配置正常运行
- [ ] （可选）删除旧 .env 文件

---

## 📚 参考资源

- [Next.js 环境变量文档](https://nextjs.org/docs/basic-features/environment-variables)
- [dotenv 文档](https://github.com/motdotla/dotenv)
- [Monorepo 最佳实践](https://monorepo.tools/)
