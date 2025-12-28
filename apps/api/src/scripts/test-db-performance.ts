/**
 * Supabase 数据库性能测试脚本
 *
 * 测试项目：
 * 1. 网络往返时间（RTT）- 最简单的 SELECT 1
 * 2. 简单查询 - 按主键查询单条记录
 * 3. 列表查询 - 查询多条记录
 * 4. 聚合查询 - COUNT/SUM 等统计
 * 5. JOIN 查询 - 多表关联
 * 6. 复杂查询 - 包含过滤、排序、分页
 *
 * 运行方法：
 * cd apps/api
 * npx tsx src/scripts/test-db-performance.ts
 */

// 首先加载环境变量
import "../env.js";

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, expenses, receipts } from "@reimbursement/shared/db";
import { and, eq, desc, isNull } from "drizzle-orm";

interface TestResult {
  name: string;
  times: number[];
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

/**
 * 执行多次测试并统计结果
 */
async function runTest(name: string, testFn: () => Promise<void>, rounds: number = 10): Promise<TestResult> {
  console.log(`\n🧪 测试: ${name}`);
  console.log(`   执行 ${rounds} 次...`);

  const times: number[] = [];

  for (let i = 0; i < rounds; i++) {
    const start = Date.now();
    await testFn();
    const duration = Date.now() - start;
    times.push(duration);
    process.stdout.write(`   [${i + 1}/${rounds}] ${duration}ms `);
  }

  console.log('\n');

  // 计算统计数据
  const sorted = [...times].sort((a, b) => a - b);
  const avgMs = Math.round(times.reduce((sum, t) => sum + t, 0) / times.length);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95Ms = sorted[p95Index];

  return { name, times, avgMs, minMs, maxMs, p95Ms };
}

/**
 * 打印测试结果
 */
function printResults(results: TestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(80));
  console.log();
  console.log('测试项目                          平均耗时    最小    最大    P95');
  console.log('-'.repeat(80));

  results.forEach(result => {
    const name = result.name.padEnd(30);
    const avg = `${result.avgMs}ms`.padStart(10);
    const min = `${result.minMs}ms`.padStart(7);
    const max = `${result.maxMs}ms`.padStart(7);
    const p95 = `${result.p95Ms}ms`.padStart(7);
    console.log(`${name} ${avg} ${min} ${max} ${p95}`);
  });

  console.log('-'.repeat(80));
  console.log();

  // 性能评估
  const avgRtt = results[0].avgMs; // 第一个测试是RTT
  console.log('💡 性能评估:');
  console.log();

  if (avgRtt < 50) {
    console.log('   ✅ 网络延迟: 优秀 (<50ms)');
  } else if (avgRtt < 100) {
    console.log('   ⚡ 网络延迟: 良好 (50-100ms)');
  } else if (avgRtt < 200) {
    console.log('   ⚠️  网络延迟: 一般 (100-200ms)');
  } else {
    console.log('   ❌ 网络延迟: 较慢 (>200ms) - 建议考虑使用更近的区域');
  }

  // 查询性能评估
  const avgQuery = results.slice(1).reduce((sum, r) => sum + r.avgMs, 0) / (results.length - 1);
  console.log();
  if (avgQuery < 100) {
    console.log('   ✅ 查询性能: 优秀 (<100ms)');
  } else if (avgQuery < 300) {
    console.log('   ⚡ 查询性能: 良好 (100-300ms)');
  } else if (avgQuery < 500) {
    console.log('   ⚠️  查询性能: 一般 (300-500ms)');
  } else {
    console.log('   ❌ 查询性能: 较慢 (>500ms) - 可能需要优化查询或添加索引');
  }

  console.log();
  console.log('📌 说明:');
  console.log('   - RTT (往返时间) 主要反映网络延迟');
  console.log('   - 简单查询性能应接近 RTT');
  console.log('   - 复杂查询性能 = RTT + 数据库处理时间');
  console.log('   - P95 表示 95% 的请求在该时间内完成');
  console.log();
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 Supabase 数据库性能测试');
  console.log('='.repeat(80));
  console.log();
  console.log('测试环境信息:');
  console.log(`   数据库: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log();

  const results: TestResult[] = [];

  try {
    // 测试 1: 网络往返时间（RTT）
    results.push(await runTest(
      '1. 网络往返时间 (SELECT 1)',
      async () => {
        await db.execute(sql`SELECT 1`);
      },
      20
    ));

    // 测试 2: 简单查询 - 查询第一个项目
    results.push(await runTest(
      '2. 简单查询 (单表单条)',
      async () => {
        await db.select().from(projects).limit(1);
      },
      15
    ));

    // 测试 3: 列表查询 - 查询多条项目
    results.push(await runTest(
      '3. 列表查询 (单表多条)',
      async () => {
        await db.select().from(projects).limit(20);
      },
      15
    ));

    // 测试 4: COUNT 聚合查询
    results.push(await runTest(
      '4. COUNT 聚合查询',
      async () => {
        await db.select({ count: sql<number>`count(*)` }).from(projects);
      },
      15
    ));

    // 测试 5: 带条件的查询
    results.push(await runTest(
      '5. 条件查询 (WHERE + LIMIT)',
      async () => {
        await db
          .select()
          .from(projects)
          .where(eq(projects.archived, false))
          .limit(10);
      },
      15
    ));

    // 测试 6: 排序查询
    results.push(await runTest(
      '6. 排序查询 (ORDER BY)',
      async () => {
        await db
          .select()
          .from(expenses)
          .orderBy(desc(expenses.date))
          .limit(20);
      },
      15
    ));

    // 测试 7: JOIN 查询
    results.push(await runTest(
      '7. JOIN 查询 (LEFT JOIN)',
      async () => {
        const receiptCounts = db
          .select({
            projectId: receipts.projectId,
            receiptCount: sql<number>`count(*)`.as("receiptCount"),
          })
          .from(receipts)
          .where(isNull(receipts.deletedAt))
          .groupBy(receipts.projectId)
          .as("receipt_counts");

        await db
          .select({
            projectId: projects.projectId,
            name: projects.name,
            receiptCount: sql<number>`coalesce(${receiptCounts.receiptCount}, 0)`,
          })
          .from(projects)
          .leftJoin(receiptCounts, eq(receiptCounts.projectId, projects.projectId))
          .limit(20);
      },
      10
    ));

    // 测试 8: 复杂查询（多条件 + JOIN + 排序）
    results.push(await runTest(
      '8. 复杂查询 (多表多条件)',
      async () => {
        await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.status, 'pending')
            )
          )
          .orderBy(desc(expenses.date))
          .limit(50);
      },
      10
    ));

    // 打印结果
    printResults(results);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }

  console.log('✅ 测试完成!');
  process.exit(0);
}

// 运行测试
main();
