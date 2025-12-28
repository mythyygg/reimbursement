# API 慢的原因分析

根据数据库性能测试结果：
- ✅ 数据库查询：平均 160-180ms（很快）
- ⚠️ 网络延迟：平均 226ms

## 为什么 API 感觉比数据库测试慢？

### 1. 延迟累积效应

**数据库测试：** 单次查询 ~170ms

**实际API请求：**
```
前端 → API服务器    : ~50-100ms (取决于网络)
  ├─ 认证中间件      : ~5-10ms
  ├─ 数据库查询      : ~170ms
  ├─ 响应序列化      : ~5-10ms
API服务器 → 前端    : ~50-100ms
────────────────────────────────
总耗时             : ~280-450ms
```

### 2. 多次数据库查询

某些API可能执行多次查询：

**例如：删除项目**
```typescript
1. 查询项目是否存在    - 170ms
2. 查询费用数量        - 170ms
3. 查询票据数量        - 170ms
4. 查询导出数量        - 170ms
5. 删除项目           - 170ms
────────────────────────────────
总耗时               - 850ms
```

### 3. 前端发起多个请求

页面加载时可能发起多个API请求：

```typescript
// 项目列表页
1. GET /api/v1/projects          - 350ms
2. GET /api/v1/settings          - 200ms (如果有)
────────────────────────────────
总耗时                           - 550ms
```

## 如何诊断

### 方法1: 查看浏览器 Network 面板

1. 打开 Chrome DevTools (F12)
2. 切换到 Network 标签
3. 刷新页面
4. 点击任意API请求，查看 Timing 标签：

```
Queueing            : 请求排队等待
Stalled             : 浏览器等待
DNS Lookup          : DNS解析
Initial Connection  : TCP连接
SSL                 : TLS握手
Request Sent        : 发送请求
Waiting (TTFB)      : 等待服务器首字节 ← 这是服务器处理时间
Content Download    : 下载响应
```

**关键指标：**
- **Waiting (TTFB)** = 服务器处理时间（包括数据库查询）
- 如果 TTFB ~170ms，说明服务器很快，慢的是网络
- 如果 TTFB >500ms，说明服务器处理慢，查看服务器日志

### 方法2: 查看服务器日志

我们已经添加了详细的性能日志：

```bash
# API 服务器日志
[API] --> GET /api/v1/projects
[projects] [DB] 查询项目列表耗时: 165ms - 返回 5 条, 总耗时: 172ms
[API] <-- GET /api/v1/projects 200 [180ms]
```

**分析：**
- DB查询: 165ms
- 总耗时: 180ms
- 其他开销: 15ms (认证、序列化等)

### 方法3: 前端性能分析

查看前端是否发起了过多请求：

```bash
# 打开 React DevTools Profiler
# 或查看 Network 瀑布图
```

## 优化建议

### 1. 减少数据库查询次数 ✅（已优化）

项目列表已使用 JOIN 优化为单次查询。

### 2. 使用批量操作

如果需要查询多个项目的详情，使用 `WHERE id IN (...)` 而不是多次查询。

### 3. 添加缓存

对于不常变化的数据（如项目列表），可以：
- 前端缓存（React Query 已配置）
- 服务端缓存（Redis）

### 4. 优化前端请求

避免串行请求，使用 `Promise.all` 并行：

```typescript
// ❌ 慢：串行
const projects = await fetchProjects();
const settings = await fetchSettings();
// 总耗时: 350ms + 200ms = 550ms

// ✅ 快：并行
const [projects, settings] = await Promise.all([
  fetchProjects(),
  fetchSettings(),
]);
// 总耗时: max(350ms, 200ms) = 350ms
```

### 5. 使用 Connection Pooling ✅（已配置）

Supabase Connection Pooler 已启用。

### 6. 考虑边缘计算

如果网络延迟是主要问题（~226ms），可以：
- 使用 Cloudflare Workers（靠近用户）
- 使用 Vercel Edge Functions
- 迁移到更近的区域（但新加坡已是最近的亚太区域）

## 实际测试步骤

### 1. 现在就测试

打开浏览器：
1. F12 打开 DevTools
2. Network 标签
3. 访问项目列表页
4. 查看任意 API 请求的 Timing

### 2. 截图给我分析

把 Network 面板的 Timing 标签截图发给我，我可以准确告诉你瓶颈在哪里。

### 3. 查看服务器日志

```bash
# API 服务器
cd apps/api
npm run dev

# 然后在前端操作，查看终端输出的日志
```

## 预期结果

正常情况下：
- **TTFB (服务器)**: 180-300ms
- **网络往返**: 100-200ms
- **总耗时**: 280-500ms

如果超过这个范围，才需要优化。
