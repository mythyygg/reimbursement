# 项目注释指南

## 概述

作为后端开发者，这份文档将帮助你快速理解项目中添加的注释，以及如何阅读前端代码。

## 已添加注释的文件

### 1. 项目根目录

#### README.md
- **位置**: `/README.md`
- **内容**: 项目整体介绍、技术栈说明、快速开始指南
- **重点**:
  - 详细的技术栈介绍（Next.js、React、Drizzle ORM 等）
  - 数据流向图解
  - Monorepo 结构说明
  - 常用命令速查

### 2. 前端代码 (apps/web)

#### apps/web/app/layout.tsx
- **功能**: Next.js 全局布局组件
- **注释重点**:
  - Next.js 的 metadata 和 viewport 配置
  - RootLayout 组件的作用
  - 如何理解 Next.js 的组件嵌套

**关键概念**:
```typescript
// Next.js 会自动将 metadata 注入到 HTML <head> 中
export const metadata = {
  title: "报销助手",
  description: "报销准备工具",
}
```

#### apps/web/app/providers.tsx
- **功能**: 全局状态提供者（React Context）
- **注释重点**:
  - React Query 的作用和用法
  - Service Worker 的工作原理
  - Provider Pattern（提供者模式）
  - useEffect 和 useState 的详细说明

**关键概念**:
```typescript
// useState: 管理组件状态
const [client] = useState(() => new QueryClient());

// useEffect: 处理副作用（网络请求、订阅等）
useEffect(() => {
  // 这里的代码只在组件挂载时执行一次
}, []);
```

#### apps/web/app/projects/[projectId]/receipts/page.tsx
- **功能**: 票据收纳箱页面
- **注释重点**:
  - React Query 的 useQuery hook 用法
  - 文件上传流程（预签名 URL 直传）
  - async/await 异步编程
  - 离线队列的工作原理

**关键概念**:
```typescript
// React Query 自动管理数据请求和缓存
const { data, refetch } = useQuery({
  queryKey: ["receipts", projectId],  // 缓存 key
  queryFn: () => apiFetch(`/projects/${projectId}/receipts`)  // 请求函数
});

// 上传流程：
// 1. 创建票据记录 → 2. 获取预签名 URL → 3. 直传到对象存储 → 4. 通知后端完成
```

### 3. 数据库 Schema (packages/shared)

#### packages/shared/src/db/schema.ts
- **功能**: 数据库表结构定义
- **注释重点**:
  - 每个表的作用和业务逻辑
  - 字段说明和数据类型
  - 关联关系和索引

**已有详细注释**，包括：
- users（用户表）
- projects（项目表）
- expenses（支出表）
- receipts（票据表）
- batches（批次表）
- exportRecords（导出记录表）
- 等等...

### 4. 后端 API (apps/api)

#### apps/api/src/routes/expenses.ts
- **功能**: 支出相关的 API 路由
- **注释重点**:
  - Hono 框架的使用方法（类似 Express）
  - Zod 数据验证
  - Drizzle ORM 查询构建
  - 中间件的作用

**关键概念**:
```typescript
// Zod Schema: 验证请求数据格式
const expenseCreateSchema = z.object({
  amount: z.number().positive(),  // 金额必须是正数
  note: z.string().min(1),        // 备注至少1个字符
  // ...
});

// Drizzle ORM 查询
const data = await db
  .select()
  .from(expenses)
  .where(and(
    eq(expenses.userId, userId),
    eq(expenses.projectId, projectId)
  ));
```

### 5. Worker 后台任务 (apps/worker)

#### apps/worker/src/jobs/export.ts
- **功能**: 导出任务处理器
- **注释重点**:
  - 为什么需要 Worker（避免 API 阻塞）
  - 导出流程（CSV + ZIP）
  - Node.js Stream 的使用
  - 对象存储操作

**关键概念**:
```typescript
// Worker 在后台异步处理耗时任务
export async function processExportJob(input: {
  exportId: string;
  userId: string;
}) {
  // 1. 查询数据
  // 2. 生成 CSV
  // 3. 下载票据文件
  // 4. 打包 ZIP
  // 5. 上传到对象存储
  // 6. 更新状态
}
```

## 前端技术栈速查

### React 核心概念

1. **组件（Component）**: 可复用的 UI 单元
```typescript
function MyComponent() {
  return <div>Hello</div>;
}
```

2. **Props**: 父组件传递给子组件的数据
```typescript
function Button({ text }: { text: string }) {
  return <button>{text}</button>;
}
```

3. **State**: 组件内部的状态
```typescript
const [count, setCount] = useState(0);  // 定义状态
setCount(count + 1);  // 更新状态
```

4. **Effect**: 副作用处理
```typescript
useEffect(() => {
  // 组件挂载时执行
  console.log("Component mounted");
}, []);  // 空数组表示只执行一次
```

### Next.js 核心概念

1. **App Router**: 基于文件系统的路由
```
app/
  page.tsx          → /
  login/
    page.tsx        → /login
  projects/
    [projectId]/
      page.tsx      → /projects/:projectId
```

2. **Server/Client Components**:
- `"use client"`: 客户端组件（浏览器运行）
- 默认: 服务端组件（服务器预渲染）

### React Query 核心概念

1. **useQuery**: 获取数据
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos
});
```

2. **useMutation**: 修改数据
```typescript
const mutation = useMutation({
  mutationFn: createTodo,
  onSuccess: () => {
    // 刷新数据
  }
});
```

## 后端技术栈速查

### Hono 框架

类似于 Express，但更轻量：

```typescript
// 定义路由
router.get("/users/:id", async (c) => {
  const id = c.req.param("id");  // 获取路径参数
  const query = c.req.query("search");  // 获取查询参数
  const body = await c.req.json();  // 获取请求体

  return c.json({ success: true });  // 返回 JSON
});
```

### Drizzle ORM

类似于 TypeORM，但更轻量：

```typescript
// 查询
const users = await db.select().from(users);

// 带条件查询
const users = await db
  .select()
  .from(users)
  .where(eq(users.id, "123"));

// 插入
await db.insert(users).values({
  name: "张三",
  email: "zhang@example.com"
});

// 更新
await db
  .update(users)
  .set({ name: "李四" })
  .where(eq(users.id, "123"));

// 删除
await db.delete(users).where(eq(users.id, "123"));
```

### Zod 数据验证

```typescript
// 定义 schema
const UserSchema = z.object({
  name: z.string().min(2),
  age: z.number().positive(),
  email: z.string().email()
});

// 验证数据
const result = UserSchema.safeParse(data);
if (result.success) {
  console.log(result.data);  // 验证通过的数据
} else {
  console.log(result.error);  // 验证错误信息
}
```

## 学习建议

### 如果你想深入理解前端代码：

1. **先从数据流开始**:
   - 用户操作 → 事件处理函数 → API 请求 → 状态更新 → UI 重新渲染

2. **理解异步编程**:
   - Promise 和 async/await
   - React Query 如何管理异步状态

3. **理解组件生命周期**:
   - 组件挂载 → 渲染 → 更新 → 卸载
   - useEffect 的执行时机

4. **理解状态管理**:
   - 本地状态（useState）
   - 全局状态（React Context）
   - 服务器状态（React Query）

### 推荐学习资源：

- **React 官方文档**: https://react.dev/learn （非常友好的教程）
- **Next.js 官方文档**: https://nextjs.org/docs （有中文版）
- **React Query 中文文档**: https://cangsdarm.github.io/react-query-web-i18n/
- **Drizzle ORM 文档**: https://orm.drizzle.team/docs/overview

## 术语对照表

| 前端术语 | 后端类比 | 说明 |
|---------|---------|------|
| Component | 模板/视图 | 可复用的 UI 单元 |
| Props | 函数参数 | 传递给组件的数据 |
| State | 变量 | 组件内部的数据 |
| useEffect | 生命周期钩子 | 副作用处理（类似 Spring 的 @PostConstruct） |
| React Query | 数据层 | 类似 Service 层，管理服务器数据 |
| Context | 全局变量/IoC容器 | 跨组件共享数据 |
| Hook | 工具函数 | 可复用的逻辑 |
| Router | 路由 | URL 到组件的映射 |

## 常见疑问

### Q: 为什么前端代码这么多异步操作？
A: 因为前端需要等待网络请求、用户输入等，使用异步可以避免界面卡顿。

### Q: useState 和 useEffect 的区别是什么？
A: useState 管理数据，useEffect 处理副作用。类比后端：
- useState = 类的成员变量
- useEffect = 生命周期方法（如 @PostConstruct）

### Q: React Query 解决了什么问题？
A: 自动管理服务器数据的请求、缓存、重试等。类比后端的 Service 层 + 缓存层。

### Q: 为什么需要 Zod 验证？
A: 确保前端传来的数据格式正确，防止脏数据进入数据库。类似后端的 DTO 验证（如 Spring Validation）。

## 下一步

如果你想为项目贡献代码，建议：

1. 先阅读 `docs/prd_core.md` 了解业务需求
2. 查看 `packages/shared/src/db/schema.ts` 了解数据结构
3. 从简单的 API 路由开始（如 `apps/api/src/routes/projects.ts`）
4. 有前端需求时，参考已有的页面代码进行修改

记住：不要害怕前端代码，它们本质上和后端代码一样，都是在处理数据和业务逻辑！

## 联系方式

如果你对某个文件的注释有疑问，可以：
1. 查看文件开头的详细注释
2. 参考本文档的"术语对照表"
3. 查阅推荐的学习资源

祝你编码愉快！🎉
