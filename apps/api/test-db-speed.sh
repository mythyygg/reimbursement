#!/bin/bash

# Supabase 数据库性能快速测试脚本
# 运行方法: ./test-db-speed.sh

cd "$(dirname "$0")/.."

echo "🚀 开始测试 Supabase 数据库速度..."
echo ""

npx tsx src/scripts/test-db-performance.ts
