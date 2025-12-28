# 快速开始指南

本指南帮助你在 **5 分钟内** 启动报销系统的本地开发环境。

---

## 📋 前置要求

- Node.js 18+ （推荐使用 LTS 版本）
- npm 或 yarn
- PostgreSQL 数据库（本地或远程）
- Git

---

## 🚀 快速启动（5 步）

### 步骤 1: 克隆项目

```bash
git clone <你的仓库地址>
cd reimbursement
```

### 步骤 2: 安装依赖

```bash
npm install
```

### 步骤 3: 配置环境变量

#### 3.1 配置后端 API

```bash
cd apps/api
cp .env.example .env.local
```

编辑 `apps/api/.env.local`，填写最少配置：

```bash
# 最少配置（其他可使用默认值）
DATABASE_URL=postgresql://user:password@localhost:5432/reimbursement
JWT_ACCESS_SECRET=your-secret-key-min-32-chars-aaaaa
JWT_REFRESH_SECRET=your-secret-key-min-32-chars-bbbbb
```

**生成 JWT 密钥：**
```bash
# 方式 1: 使用 openssl
openssl rand -base64 32

# 方式 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 3.2 配置前端 Web

```bash
cd ../web
cp .env.example .env.local
```

编辑 `apps/web/.env.local`：

```bash
NEXT_PUBLIC_API_BASE=http://localhost:8787/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### 步骤 4: 初始化数据库

```bash
# 返回项目根目录
cd ../..

# 运行数据库迁移
npm run db:push
```

### 步骤 5: 启动开发服务器

```bash
# 同时启动前端、后端、Worker
npm run dev

# 或分别启动
npm run dev:web    # 前端: http://localhost:3001
npm run dev:api    # 后端: http://localhost:8787
npm run dev:worker # Worker 后台任务
```

**访问应用：**
- 前端：http://localhost:3001
- API 文档：http://localhost:8787/health

---

## ✅ 验证安装

### 1. 检查后端 API

```bash
curl http://localhost:8787/health
# 预期响应: {"status":"ok"}
```

### 2. 检查前端

打开浏览器访问 http://localhost:3001
- ✅ 页面正常显示
- ✅ 没有控制台错误
- ✅ 可以注册/登录

---

## 🔧 可选配置

### 配置 S3 对象存储（上传票据图片）

如果需要上传功能，配置 Cloudflare R2 或其他 S3 兼容服务：

```bash
# 编辑 apps/api/.env.local
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=reimbursement
S3_PUBLIC_BASE_URL=https://s3.yourdomain.com  # 可选
```

**获取 R2 凭证：**
1. 访问 https://dash.cloudflare.com
2. R2 → 创建 Bucket
3. 管理 R2 API 令牌 → 创建 API 令牌

---

## 🐛 常见问题

### 问题 1: 数据库连接失败

**错误：** `Error: connect ECONNREFUSED`

**解决：**
```bash
# 检查数据库是否运行
psql -U postgres -c "SELECT 1"

# 检查 DATABASE_URL 配置
cat apps/api/.env.local | grep DATABASE_URL

# 如果使用 Docker 启动 PostgreSQL
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15
```

### 问题 2: 端口被占用

**错误：** `Error: listen EADDRINUSE: address already in use :::8787`

**解决：**
```bash
# 方式 1: 杀掉占用端口的进程
lsof -ti:8787 | xargs kill

# 方式 2: 修改端口
# 编辑 apps/api/.env.local
echo "PORT=8788" >> apps/api/.env.local
```

### 问题 3: 前端无法连接后端

**症状：** 前端页面 CORS 错误或 Network Error

**解决：**
```bash
# 1. 检查后端是否启动
curl http://localhost:8787/health

# 2. 检查前端 API 地址配置
cat apps/web/.env.local | grep NEXT_PUBLIC_API_BASE

# 3. 确保地址匹配
# apps/api 运行在 8787，apps/web/.env.local 应配置：
# NEXT_PUBLIC_API_BASE=http://localhost:8787/api/v1
```

---

## 📚 下一步

环境搭建完成后，可以：

1. **阅读项目文档**
   - [部署指南](./DEPLOYMENT.md)
   - [环境变量迁移指南](./ENV_MIGRATION_GUIDE.md)
   - [架构文档](./ARCHITECTURE.md)（如果有）

2. **开发功能**
   - 前端代码：`apps/web`
   - 后端代码：`apps/api`
   - 共享代码：`packages/shared`

3. **数据库管理**
   ```bash
   # 打开 Drizzle Studio（可视化数据库管理）
   npm run db:studio
   # 访问 https://local.drizzle.studio
   ```

4. **代码检查**
   ```bash
   npm run lint  # 代码检查
   ```

---

## 💡 开发技巧

### 1. 使用 Drizzle Studio 查看数据库

```bash
npm run db:studio
```

浏览器打开 https://local.drizzle.studio，可以：
- 查看表结构
- 浏览数据
- 执行 SQL 查询

### 2. 查看 API 日志

后端控制台会显示：
- 请求日志（请求路径、方法、耗时）
- 数据库查询日志
- 错误堆栈

### 3. 前端开发工具

- React DevTools
- Chrome Network 面板（查看 API 请求）
- Redux DevTools（如果使用）

---

## 🎯 快速命令参考

```bash
# 开发
npm run dev              # 启动所有服务
npm run dev:web          # 仅启动前端
npm run dev:api          # 仅启动后端
npm run dev:worker       # 仅启动 Worker

# 构建
npm run build            # 构建前端

# 数据库
npm run db:push          # 推送 schema 到数据库
npm run db:generate      # 生成迁移文件
npm run db:studio        # 打开数据库管理界面

# 代码检查
npm run lint             # ESLint 检查
```

---

**🎉 恭喜！你已经成功启动了报销系统！**

如有问题，请查阅：
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署文档
- [ENV_MIGRATION_GUIDE.md](./ENV_MIGRATION_GUIDE.md) - 环境变量配置详解
- GitHub Issues - 提交问题
