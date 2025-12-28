#!/bin/bash

#==========================================
# Monorepo 项目结构重构脚本
#==========================================
# 用途：按照 Monorepo 最佳实践重构项目结构
# 作者：Claude AI
# 日期：2024-12-28
#==========================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查当前目录
if [ ! -f "package.json" ]; then
    log_error "请在项目根目录执行此脚本"
    exit 1
fi

log_info "开始 Monorepo 项目结构重构..."

#==========================================
# 步骤 1: 创建备份
#==========================================
log_info "步骤 1/7: 创建备份..."

if [ ! -d ".git" ]; then
    log_warn "未检测到 Git 仓库，跳过 Git 备份"
else
    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warn "检测到未提交的更改，建议先提交"
        read -p "是否继续？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "已取消重构"
            exit 0
        fi
    fi
fi

#==========================================
# 步骤 2: 创建新目录结构
#==========================================
log_info "步骤 2/7: 创建新目录结构..."

mkdir -p docs/guides
mkdir -p docs/architecture
mkdir -p docs/design
mkdir -p docs/api
mkdir -p docs/progress
mkdir -p .archive/env-backup

log_info "✓ 目录结构创建完成"

#==========================================
# 步骤 3: 移动文档文件
#==========================================
log_info "步骤 3/7: 移动文档文件..."

# 指南文档
[ -f "QUICK_START.md" ] && mv QUICK_START.md docs/guides/quick-start.md && log_info "  ✓ QUICK_START.md → docs/guides/"
[ -f "DEPLOYMENT.md" ] && mv DEPLOYMENT.md docs/guides/deployment.md && log_info "  ✓ DEPLOYMENT.md → docs/guides/"
[ -f "ENV_MIGRATION_GUIDE.md" ] && mv ENV_MIGRATION_GUIDE.md docs/guides/env-migration.md && log_info "  ✓ ENV_MIGRATION_GUIDE.md → docs/guides/"
[ -f "CODE_GUIDE_JAVA_DEV.md" ] && mv CODE_GUIDE_JAVA_DEV.md docs/guides/code-guide-java-dev.md && log_info "  ✓ CODE_GUIDE_JAVA_DEV.md → docs/guides/"
[ -f "JS_FRONTEND_CONCEPTS.md" ] && mv JS_FRONTEND_CONCEPTS.md docs/guides/js-frontend-concepts.md && log_info "  ✓ JS_FRONTEND_CONCEPTS.md → docs/guides/"

# 架构文档
[ -f "ARCHITECTURE.md" ] && mv ARCHITECTURE.md docs/architecture/overview.md && log_info "  ✓ ARCHITECTURE.md → docs/architecture/"
[ -f "ENVIRONMENT_CONFIG.md" ] && mv ENVIRONMENT_CONFIG.md docs/architecture/environment-config.md && log_info "  ✓ ENVIRONMENT_CONFIG.md → docs/architecture/"
[ -f "COMMENTS_GUIDE.md" ] && mv COMMENTS_GUIDE.md docs/architecture/comments-guide.md && log_info "  ✓ COMMENTS_GUIDE.md → docs/architecture/"

# 进度文档
[ -f "CODE_COMMENTS_PROGRESS.md" ] && mv CODE_COMMENTS_PROGRESS.md docs/progress/code-comments-progress.md && log_info "  ✓ CODE_COMMENTS_PROGRESS.md → docs/progress/"

# 设计文档
[ -d "ui_prototype" ] && mv ui_prototype docs/design/ui-prototype && log_info "  ✓ ui_prototype/ → docs/design/"
[ -f "docs/prd_core.md" ] && mv docs/prd_core.md docs/design/ && log_info "  ✓ prd_core.md → docs/design/"
[ -f "docs/prd_ui.md" ] && mv docs/prd_ui.md docs/design/ && log_info "  ✓ prd_ui.md → docs/design/"
[ -f "docs/fullstack_plan.md" ] && mv docs/fullstack_plan.md docs/design/ && log_info "  ✓ fullstack_plan.md → docs/design/"
[ -f "docs/techdesign.md" ] && mv docs/techdesign.md docs/design/ && log_info "  ✓ techdesign.md → docs/design/"
[ -f "docs/getting_started.md" ] && mv docs/getting_started.md docs/guides/getting-started.md && log_info "  ✓ getting_started.md → docs/guides/"

# API 文档
[ -d "docs/openapi" ] && mv docs/openapi docs/api/ && log_info "  ✓ openapi/ → docs/api/"

# 清理空目录
[ -d "docs/openspec" ] && rmdir docs/openspec 2>/dev/null && log_info "  ✓ 清理空目录 docs/openspec"

log_info "✓ 文档文件移动完成"

#==========================================
# 步骤 4: 清理环境变量文件
#==========================================
log_info "步骤 4/7: 清理环境变量文件..."

if [ -f ".env.development" ] || [ -f ".env.production" ]; then
    log_warn "检测到根目录有环境变量文件"

    # 检查应用目录是否有环境变量文件
    if [ ! -f "apps/api/.env.example" ] || [ ! -f "apps/web/.env.example" ]; then
        log_error "apps/api 或 apps/web 缺少 .env.example 文件"
        log_error "请先运行环境变量迁移，再执行此脚本"
        exit 1
    fi

    # 备份并移除
    [ -f ".env.development" ] && mv .env.development .archive/env-backup/ && log_info "  ✓ .env.development → .archive/env-backup/"
    [ -f ".env.production" ] && mv .env.production .archive/env-backup/ && log_info "  ✓ .env.production → .archive/env-backup/"

    log_info "✓ 环境变量文件已备份到 .archive/env-backup/"
else
    log_info "✓ 根目录无环境变量文件，跳过"
fi

#==========================================
# 步骤 5: 清理系统文件
#==========================================
log_info "步骤 5/7: 清理系统文件..."

# 删除 .DS_Store
find . -name ".DS_Store" -type f -delete && log_info "  ✓ 已删除所有 .DS_Store 文件"

log_info "✓ 系统文件清理完成"

#==========================================
# 步骤 6: 检查应用状态
#==========================================
log_info "步骤 6/7: 检查应用环境变量..."

# 检查 API
if [ -f "apps/api/.env.local" ] || [ -f "apps/api/.env" ]; then
    log_info "  ✓ apps/api 有环境变量文件"
else
    log_warn "  ⚠ apps/api 缺少环境变量文件，请从 .env.example 复制"
fi

# 检查 Web
if [ -f "apps/web/.env.local" ] || [ -f "apps/web/.env" ]; then
    log_info "  ✓ apps/web 有环境变量文件"
else
    log_warn "  ⚠ apps/web 缺少环境变量文件，请从 .env.example 复制"
fi

#==========================================
# 步骤 7: 显示摘要
#==========================================
log_info "步骤 7/7: 重构完成摘要"

echo ""
echo "=========================================="
echo "  📦 Monorepo 重构完成！"
echo "=========================================="
echo ""
echo "✅ 完成的操作："
echo "  • 创建了标准文档目录结构"
echo "  • 移动了所有文档到 docs/"
echo "  • 备份并移除了根目录环境变量"
echo "  • 清理了系统文件"
echo ""
echo "📂 新的项目结构："
echo "  reimbursement/"
echo "  ├── apps/          # 应用程序"
echo "  ├── packages/      # 共享包"
echo "  ├── docs/          # 📚 所有文档"
echo "  │   ├── guides/    # 指南"
echo "  │   ├── architecture/  # 架构"
echo "  │   ├── design/    # 设计"
echo "  │   └── api/       # API 文档"
echo "  ├── scripts/       # 🔧 脚本"
echo "  └── .archive/      # 归档文件"
echo ""
echo "🔍 下一步："
echo "  1. 查看文档：cat docs/README.md"
echo "  2. 测试应用：npm run dev"
echo "  3. 提交更改：git add . && git commit -m 'refactor: 重构为 Monorepo 标准结构'"
echo ""
echo "=========================================="

log_info "重构脚本执行完成！"
