# Monorepo 项目结构重构方案

## 📋 当前结构问题分析

### 问题清单

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 1. 根目录有 `.env.development` 和 `.env.production` | 违反 Monorepo 最佳实践 | 🔴 高 |
| 2. 大量文档散落在根目录（10+ 个 .md 文件） | 根目录混乱，难以维护 | 🔴 高 |
| 3. `ui_prototype/` 在根目录 | 设计资源应该分类存放 | 🟡 中 |
| 4. `.idea/` IDE 配置未忽略 | 不应提交到版本控制 | 🟡 中 |
| 5. `.DS_Store` 未忽略 | macOS 系统文件污染仓库 | 🟢 低 |
| 6. `api/` 目录命名不清晰 | 不明确是否是应用代码 | 🟡 中 |

---

## 🎯 目标结构（Monorepo 最佳实践）

### 标准 Monorepo 结构

```
reimbursement/
├── .github/                      # GitHub 配置
│   └── workflows/                # CI/CD 工作流
├── apps/                         # 应用程序
│   ├── api/                      # 后端 API
│   ├── web/                      # 前端 Web
│   └── worker/                   # 后台 Worker
├── packages/                     # 共享包
│   └── shared/                   # 共享代码
├── docs/                         # 📚 所有文档
│   ├── guides/                   # 指南文档
│   ├── design/                   # 设计文档和原型
│   └── api/                      # API 文档
├── scripts/                      # 🔧 脚本工具
├── config/                       # ⚙️ 共享配置（可选）
├── .vercel/                      # Vercel 部署配置
│   └── api/                      # Serverless Functions
├── .gitignore                    # Git 忽略规则
├── package.json                  # 根 package.json
├── tsconfig.base.json            # 基础 TypeScript 配置
├── README.md                     # 项目说明
└── vercel.json                   # Vercel 配置
```

### 根目录应该保留的文件

**配置文件：**
- `package.json` - 根依赖和脚本
- `package-lock.json` - 锁定文件
- `tsconfig.base.json` - 基础 TS 配置
- `vercel.json` - Vercel 部署配置
- `.gitignore` - Git 忽略规则

**核心文档：**
- `README.md` - 项目说明（简洁，引导到 docs/）
- `CONTRIBUTING.md` - 贡献指南（可选）
- `LICENSE` - 许可证（可选）

**隐藏目录：**
- `.git/` - Git 仓库
- `.github/` - GitHub 配置
- `.vercel/` - Vercel 配置
- `.claude/` - Claude 配置
- `node_modules/` - 依赖

---

## 📦 详细重构方案

### 方案 A: 完全重构（推荐） ⭐

彻底按照 Monorepo 最佳实践重构。

#### 1. 文档整理

**目标结构：**
```
docs/
├── README.md                     # 文档索引
├── guides/                       # 指南类文档
│   ├── quick-start.md            # 快速开始
│   ├── deployment.md             # 部署指南
│   ├── env-migration.md          # 环境变量迁移
│   ├── code-guide-java-dev.md    # Java 开发者指南
│   └── js-frontend-concepts.md   # JS 前端概念
├── architecture/                 # 架构文档
│   ├── overview.md               # 架构概览
│   ├── environment-config.md     # 环境配置
│   └── comments-guide.md         # 代码注释指南
├── design/                       # 设计文档
│   ├── ui-prototype/             # UI 原型（移动 ui_prototype/）
│   ├── prd-core.md               # 产品需求（核心）
│   ├── prd-ui.md                 # 产品需求（UI）
│   ├── fullstack-plan.md         # 全栈计划
│   └── techdesign.md             # 技术设计
├── api/                          # API 文档
│   └── openapi/                  # OpenAPI 规范
│       ├── openapi.yaml
│       ├── openapi_components_core.yaml
│       └── openapi_components_requests.yaml
└── progress/                     # 进度追踪
    └── code-comments-progress.md # 代码注释进度
```

**文件移动清单：**
| 当前位置 | 移动到 | 说明 |
|----------|--------|------|
| `QUICK_START.md` | `docs/guides/quick-start.md` | 快速开始指南 |
| `DEPLOYMENT.md` | `docs/guides/deployment.md` | 部署指南 |
| `ENV_MIGRATION_GUIDE.md` | `docs/guides/env-migration.md` | 环境变量迁移 |
| `CODE_GUIDE_JAVA_DEV.md` | `docs/guides/code-guide-java-dev.md` | Java 开发者指南 |
| `JS_FRONTEND_CONCEPTS.md` | `docs/guides/js-frontend-concepts.md` | 前端概念 |
| `ARCHITECTURE.md` | `docs/architecture/overview.md` | 架构概览 |
| `ENVIRONMENT_CONFIG.md` | `docs/architecture/environment-config.md` | 环境配置 |
| `COMMENTS_GUIDE.md` | `docs/architecture/comments-guide.md` | 注释指南 |
| `CODE_COMMENTS_PROGRESS.md` | `docs/progress/code-comments-progress.md` | 注释进度 |
| `ui_prototype/` | `docs/design/ui-prototype/` | UI 原型 |
| `docs/prd_core.md` | `docs/design/prd-core.md` | 产品需求 |
| `docs/prd_ui.md` | `docs/design/prd-ui.md` | 产品需求 UI |
| `docs/fullstack_plan.md` | `docs/design/fullstack-plan.md` | 全栈计划 |
| `docs/techdesign.md` | `docs/design/techdesign.md` | 技术设计 |
| `docs/openapi/` | `docs/api/openapi/` | OpenAPI 规范 |

#### 2. Vercel 配置整理

**当前：** `api/index.ts` （根目录）
**目标：** `.vercel/api/index.ts` 或保持原位

**建议：** 保持 `api/index.ts` 不动，因为 Vercel 默认识别此路径。

#### 3. 环境变量清理

**移除根目录的环境变量文件：**
```bash
# 备份
mkdir -p .archive/env-backup
mv .env.development .archive/env-backup/
mv .env.production .archive/env-backup/

# 确认 apps/api 和 apps/web 已有各自的 .env 文件
```

#### 4. 更新 .gitignore

添加以下规则：
```gitignore
# IDE
.idea/
.vscode/
*.swp
*.swo

# macOS
.DS_Store
.AppleDouble
.LSOverride

# 环境变量（根目录不应有）
/.env
/.env.*
!/.env.example

# 归档
.archive/

# 临时文件
*.log
*.tmp
```

#### 5. 创建脚本目录（可选）

```
scripts/
├── setup.sh                      # 初始化脚本
├── clean.sh                      # 清理脚本
└── migrate-env.sh                # 环境变量迁移脚本
```

---

### 方案 B: 渐进式重构（保守）

保持现有结构，仅做最小调整。

#### 仅处理高优先级问题：

1. ✅ 移除根目录 `.env.development` 和 `.env.production`
2. ✅ 更新 `.gitignore`（忽略 `.idea/` 和 `.DS_Store`）
3. ✅ 将核心文档整理到 `docs/guides/`

**不移动：**
- `ui_prototype/` 保持原位
- 其他文档保持原位

---

## 🔄 重构执行步骤（方案 A）

### 步骤 1: 创建新目录结构

```bash
# 创建文档目录
mkdir -p docs/guides
mkdir -p docs/architecture
mkdir -p docs/design
mkdir -p docs/api
mkdir -p docs/progress

# 创建脚本目录
mkdir -p scripts

# 创建归档目录
mkdir -p .archive/env-backup
```

### 步骤 2: 移动文档文件

```bash
# 指南文档
mv QUICK_START.md docs/guides/quick-start.md
mv DEPLOYMENT.md docs/guides/deployment.md
mv ENV_MIGRATION_GUIDE.md docs/guides/env-migration.md
mv CODE_GUIDE_JAVA_DEV.md docs/guides/code-guide-java-dev.md
mv JS_FRONTEND_CONCEPTS.md docs/guides/js-frontend-concepts.md

# 架构文档
mv ARCHITECTURE.md docs/architecture/overview.md
mv ENVIRONMENT_CONFIG.md docs/architecture/environment-config.md
mv COMMENTS_GUIDE.md docs/architecture/comments-guide.md

# 进度文档
mv CODE_COMMENTS_PROGRESS.md docs/progress/code-comments-progress.md

# 设计文档
mv ui_prototype docs/design/ui-prototype
mv docs/prd_core.md docs/design/
mv docs/prd_ui.md docs/design/
mv docs/fullstack_plan.md docs/design/
mv docs/techdesign.md docs/design/

# API 文档
mv docs/openapi docs/api/

# 移除旧 docs/ 子目录
mv docs/getting_started.md docs/guides/getting-started.md 2>/dev/null || true
rmdir docs/openspec 2>/dev/null || true
```

### 步骤 3: 清理环境变量

```bash
# 备份根目录环境变量
mv .env.development .archive/env-backup/
mv .env.production .archive/env-backup/

# 确认各应用已有环境变量文件
ls apps/api/.env*
ls apps/web/.env*
```

### 步骤 4: 更新 .gitignore

```bash
cat >> .gitignore << 'EOF'

# ==========================================
# IDE 配置
# ==========================================
.idea/
.vscode/
*.swp
*.swo
*.sublime-*

# ==========================================
# macOS 系统文件
# ==========================================
.DS_Store
.AppleDouble
.LSOverride
Icon?
._*

# ==========================================
# 归档和临时文件
# ==========================================
.archive/
*.tmp
*.bak

# ==========================================
# 根目录不应有环境变量
# ==========================================
/.env
/.env.*
!/.env.example
EOF
```

### 步骤 5: 创建文档索引

创建 `docs/README.md`

### 步骤 6: 更新根 README.md

简化根 README，引导到 docs/

### 步骤 7: 验证和提交

```bash
# 验证应用仍可正常运行
npm run dev:api
npm run dev:web

# 提交更改
git add .
git commit -m "refactor: 按照 Monorepo 最佳实践重构项目结构

- 将文档整理到 docs/ 目录
- 移除根目录环境变量文件
- 更新 .gitignore
- 创建文档索引"
```

---

## ✅ 重构检查清单

### 移动前
- [ ] 备份当前项目（git commit 或 tar）
- [ ] 确认各应用有独立的 .env 文件
- [ ] 记录当前文件位置

### 移动中
- [ ] 创建新目录结构
- [ ] 移动文档文件
- [ ] 移动设计资源
- [ ] 清理环境变量
- [ ] 更新 .gitignore

### 移动后
- [ ] 验证应用可正常启动
- [ ] 检查文档链接是否失效
- [ ] 更新 README.md
- [ ] 创建文档索引
- [ ] Git 提交

---

## 📊 对比表

### 重构前 vs 重构后

| 项目 | 重构前 | 重构后 |
|------|--------|--------|
| 根目录文件数 | 20+ | 6-8 |
| 文档位置 | 散落在根目录 | 统一在 docs/ |
| 环境变量 | 根目录 + 应用目录 | 仅应用目录 |
| IDE 配置 | 提交到 Git | 已忽略 |
| 结构清晰度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 推荐方案

**推荐：方案 A（完全重构）**

**理由：**
1. ✅ 符合 Monorepo 最佳实践
2. ✅ 提高项目可维护性
3. ✅ 便于新成员快速上手
4. ✅ 专业度提升

**成本：**
- 时间：约 30 分钟
- 风险：低（可随时回滚）

---

## 🚀 开始重构

准备好了吗？执行以下命令开始：

```bash
# 1. 备份当前状态
git add .
git commit -m "chore: 重构前备份"

# 2. 运行重构脚本（我会帮你创建）
bash scripts/refactor.sh

# 3. 验证
npm run dev

# 4. 提交
git add .
git commit -m "refactor: 重构项目结构为 Monorepo 最佳实践"
```

**需要我帮你执行重构吗？**
