# 报销准备工具 (Reimbursement Prep)

## 项目概述

这是一个帮助你管理项目报销的工具，主要功能包括：
- 📝 记录垫付支出（金额、日期、备注等）
- 📎 收纳票据（截图、文件、PDF等）
- 🔗 智能匹配支出和票据
- 📦 批量导出报销包（CSV + ZIP）

**移动端优先设计**：可以在手机上快速录入支出和上传票据。

## 技术架构（适合后端开发者）

### Monorepo 结构

本项目使用 npm workspaces 管理多个子包，目录结构如下：

```
reimbursement/
├── apps/                    # 应用层
│   ├── api/                # 后端 API 服务
│   ├── web/                # 前端 Web 应用 (Next.js)
│   └── worker/             # 后台任务处理器
├── packages/               # 共享代码
│   └── shared/             # 数据库 schema、类型定义、工具函数
└── docs/                   # 文档
```

### 技术栈

#### 前端 (apps/web)
- **Next.js 15**: React 框架，用于构建 Web 应用
  - 采用 App Router（新版路由方式）
  - 支持服务端渲染 (SSR) 和客户端渲染 (CSR)
- **React 19**: UI 组件库
- **TailwindCSS**: CSS 工具类框架，用于样式
- **Shadcn/ui**: 基于 Radix UI 的组件库

#### 后端 (apps/api)
- **Hono**: 轻量级 Web 框架（类似 Express）
- **Drizzle ORM**: 数据库操作工具（类似 TypeORM/Prisma）
- **PostgreSQL**: 关系型数据库
- **MinIO**: 对象存储（兼容 AWS S3 API）

#### Worker (apps/worker)
- **BullMQ**: 任务队列系统（基于 Redis）
- 处理耗时任务：批次检查、导出 CSV/ZIP 等

#### 共享代码 (packages/shared)
- 数据库表结构定义 (Drizzle schema)
- TypeScript 类型定义
- 业务逻辑工具函数

### 数据流向

```
用户操作 (浏览器)
    ↓
前端应用 (Next.js) - localhost:3000
    ↓ HTTP 请求
后端 API (Hono) - localhost:8787
    ↓ 读写数据
PostgreSQL 数据库 - localhost:5432
    ↓ 存储文件
MinIO 对象存储 - localhost:9000
    ↓ 后台任务
Worker (BullMQ) - 处理导出等耗时操作
```

## 核心概念（业务逻辑）

### 1. 项目 (Project)
- 每个报销项目是一个独立的单元
- 包含多个支出记录和票据

### 2. 支出 (Expense)
- 记录每一笔垫付的钱
- 必填：金额、日期
- 可选：类别、备注
- 状态：缺票 / 已匹配 / 不需要票

### 3. 票据 (Receipt)
- 上传的截图或文件（发票、收据等）
- 支持 OCR 识别金额和日期
- 可以与支出记录关联

### 4. 匹配逻辑
- 系统会智能推荐票据和支出的匹配关系
- 根据金额、日期、类别等信息计算相似度
- **必须人工确认**才会真正绑定

### 5. 批次导出 (Batch Export)
- 选择日期范围内的支出
- 生成 CSV 清单 + ZIP 压缩包（包含所有票据）
- 可以直接提交给财务部门

## 快速开始

详细的启动步骤请参考：[docs/getting_started.md](docs/getting_started.md)

### 简化版启动步骤

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量配置
cp .env.example .env

# 3. 启动 Docker 服务（PostgreSQL + MinIO）
docker-compose up -d

# 4. 初始化数据库
npm run db:generate
npm run db:migrate

# 5. 启动所有服务（前端 + 后端 + Worker）
npm run dev
```

然后访问 http://localhost:3000

## 开发指南

### 常用命令

```bash
# 只启动前端
npm run dev:web

# 只启动后端 API
npm run dev:api

# 只启动 Worker
npm run dev:worker

# 数据库迁移
npm run db:generate    # 生成迁移文件
npm run db:migrate     # 执行迁移
npm run db:push        # 直接推送 schema 变更（开发环境）
npm run db:studio      # 打开 Drizzle Studio 可视化管理数据库
```

### 目录说明

#### apps/api/
- `src/routes/`: API 路由定义（类似 Express 的 router）
- `src/config.ts`: 配置文件（数据库连接、S3 等）
- `drizzle/`: 数据库迁移文件

#### apps/web/
- `app/`: Next.js 页面和路由（使用 App Router）
  - `layout.tsx`: 全局布局
  - `page.tsx`: 首页
  - `projects/`: 项目相关页面
  - `login/`: 登录页面
- `components/`: React 组件
- `lib/`: 工具函数和 API 客户端

#### apps/worker/
- `src/jobs/`: 后台任务定义
  - `batch-check.ts`: 批次检查任务
  - `export.ts`: 导出任务

#### packages/shared/
- `src/db/schema.ts`: 数据库表结构定义（Drizzle ORM）
- `src/domain/`: 业务领域模型和类型
- `src/utils/`: 工具函数（如匹配算法）

## 关键文件注释说明

为了帮助后端开发者理解前端代码，我已经在以下文件中添加了详细的中文注释：

- [ ] `apps/web/app/layout.tsx` - Next.js 全局布局
- [ ] `apps/web/app/projects/[projectId]/receipts/page.tsx` - 票据页面
- [ ] `packages/shared/src/db/schema.ts` - 数据库表结构
- [ ] `apps/api/src/routes/expenses.ts` - 支出 API
- [ ] `apps/worker/src/jobs/export.ts` - 导出任务

## 学习资源

如果你想了解更多关于前端技术栈的知识：

- **Next.js**: https://nextjs.org/docs - React 全栈框架
- **React**: https://react.dev - 用于构建用户界面的 JavaScript 库
- **TailwindCSS**: https://tailwindcss.com - CSS 工具类框架
- **Drizzle ORM**: https://orm.drizzle.team - TypeScript ORM

## 项目文档

- [产品需求文档 (PRD)](docs/prd_core.md) - 详细的功能需求
- [技术设计文档](docs/techdesign.md) - 架构设计
- [启动指南](docs/getting_started.md) - 详细的启动步骤

## 常见问题

**Q: Next.js 的 App Router 是什么？**
A: Next.js 13+ 引入的新路由方式，使用文件系统路由。`app/` 目录下的文件夹结构对应 URL 路径。

**Q: 为什么用 Drizzle ORM 而不是 Prisma？**
A: Drizzle 更轻量，提供更接近 SQL 的 API，对 TypeScript 类型支持更好。

**Q: BullMQ 的作用是什么？**
A: 处理后台任务，比如生成 CSV、打包 ZIP 等耗时操作。这样前端不用等待，用户体验更好。

**Q: MinIO 是什么？**
A: 开源的对象存储服务，兼容 AWS S3 API。本地开发用它存储上传的票据文件。

## License

MIT
