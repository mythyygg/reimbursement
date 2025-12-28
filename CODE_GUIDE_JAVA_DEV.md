# 代码详解手册 - 面向 Java 开发者

> 本手册为项目中每个核心文件提供详细的代码说明和 Java 对比

---

## 后端 API 核心文件

### 1. apps/api/src/index.ts - API 应用入口

**【Java 对比】** 类似 Spring Boot 主类 `@SpringBootApplication`

```typescript
// 创建应用实例（类似 SpringApplication）
const app = new Hono();

// 全局中间件（类似 @Bean 注册的 Filter）
app.use("*", cors());          // CORS过滤器
app.use("*", timingMiddleware);  // 性能计时过滤器

// 全局异常处理（类似 @ExceptionHandler）
app.onError((err, c) => {
  // 返回统一错误格式
});

// 健康检查端点（类似 /actuator/health）
app.get("/health", (c) => c.json({ status: "ok" }));

// 路由注册（类似 @RequestMapping）
app.route("/api/v1/auth", authRoutes);
app.use("/api/v1/*", authMiddleware);  // 认证中间件
app.route("/api/v1/projects", projectRoutes);
```

**关键概念：**
- `app.use()` - 注册中间件，作用于所有匹配的路由
- `app.route()` - 挂载子路由模块
- `app.onError()` - 全局错误处理
- `export default app` - 导出应用实例供服务器使用

---

### 2. apps/api/src/db/client.ts - 数据库客户端

**【Java 对比】** 类似 JPA 的 EntityManager 或 JDBC DataSource

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// 创建 PostgreSQL 连接池（类似 HikariCP）
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 创建 Drizzle ORM 实例（类似 EntityManager）
export const db = drizzle(pool, { schema });
```

**使用方式：**
```typescript
// 插入数据（类似 repository.save()）
await db.insert(users).values({ name: "张三" });

// 查询数据（类似 repository.findById()）
const user = await db.query.users.findFirst({
  where: eq(users.userId, id)
});

// 更新数据（类似 repository.update()）
await db.update(users)
  .set({ name: "李四" })
  .where(eq(users.userId, id));

// JOIN 查询（类似 JPQL）
const result = await db
  .select()
  .from(projects)
  .innerJoin(users, eq(projects.userId, users.userId));
```

---

### 3. apps/api/src/routes/auth.ts - 认证路由

**【Java 对比】** 类似 `@RestController` + `@RequestMapping("/auth")`

```java
// Java 等价代码
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @PostMapping("/register")
    public TokenResponse register(@RequestBody RegisterRequest req) {
        // 注册逻辑
    }

    @PostMapping("/login")
    public TokenResponse login(@RequestBody LoginRequest req) {
        // 登录逻辑
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@RequestBody RefreshRequest req) {
        // 刷新令牌
    }
}
```

**TypeScript 实现：**
```typescript
const app = new Hono();

// POST /api/v1/auth/register
app.post("/register", async (c) => {
  // 获取请求体（类似 @RequestBody）
  const body = await c.req.json();

  // 验证输入（类似 @Valid）
  const parsed = registerSchema.parse(body);

  // 业务逻辑
  const hashedPassword = await hashPassword(parsed.password);
  const user = await db.insert(users).values({
    emailOrPhone: parsed.emailOrPhone,
    passwordHash: hashedPassword
  });

  // 返回响应（类似 ResponseEntity）
  return c.json({ userId: user.userId }, 201);
});

export default app;
```

**关键概念：**
- `c.req.json()` - 获取请求体，类似 `@RequestBody`
- `c.json(data, status)` - 返回JSON响应，类似 `ResponseEntity`
- `async/await` - 异步处理，类似 `CompletableFuture`

---

### 4. apps/api/src/routes/projects.ts - 项目路由

**核心API端点：**

```typescript
// GET /api/v1/projects - 查询项目列表
app.get("/", async (c) => {
  const auth = c.get("auth");  // 获取认证信息
  const projects = await db.query.projects.findMany({
    where: eq(projects.userId, auth.userId),
    orderBy: desc(projects.createdAt)
  });
  return c.json(projects);
});

// POST /api/v1/projects - 创建项目
app.post("/", async (c) => {
  const body = await c.req.json();
  const project = await db.insert(projects).values({
    userId: c.get("auth").userId,
    name: body.name,
    description: body.description
  }).returning();
  return c.json(project[0], 201);
});

// PATCH /api/v1/projects/:id - 更新项目
app.patch("/:id", async (c) => {
  const id = c.req.param("id");  // 路径参数
  const body = await c.req.json();
  await db.update(projects)
    .set(body)
    .where(eq(projects.projectId, id));
  return c.json({ success: true });
});
```

---

## 前端核心文件

### 5. apps/web/lib/api.ts - API 调用封装

**【Java 对比】** 类似 RestTemplate 或 Feign Client

```typescript
/**
 * API 基础配置
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE;  // 类似 @Value("${api.base-url}")

/**
 * 通用 HTTP 请求函数
 *
 * 【Java 对比】类似:
 * ```java
 * public <T> T request(String url, HttpMethod method, Object body, Class<T> responseType) {
 *     RestTemplate restTemplate = new RestTemplate();
 *     HttpHeaders headers = new HttpHeaders();
 *     headers.setBearerAuth(getAccessToken());
 *     HttpEntity<Object> entity = new HttpEntity<>(body, headers);
 *     return restTemplate.exchange(url, method, entity, responseType).getBody();
 * }
 * ```
 */
async function request(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // 获取访问令牌
  const token = getAccessToken();

  // 构造请求头
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers
  };

  // 发送请求（fetch 类似 HttpURLConnection）
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  // 处理错误响应
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

/**
 * API 调用方法
 */
export const api = {
  // GET 请求
  async get<T>(url: string): Promise<T> {
    const res = await request(url);
    return res.json();
  },

  // POST 请求
  async post<T>(url: string, body: unknown): Promise<T> {
    const res = await request(url, {
      method: "POST",
      body: JSON.stringify(body)
    });
    return res.json();
  },

  // PATCH 请求
  async patch<T>(url: string, body: unknown): Promise<T> {
    const res = await request(url, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    return res.json();
  },

  // DELETE 请求
  async delete(url: string): Promise<void> {
    await request(url, { method: "DELETE" });
  }
};
```

**使用示例：**
```typescript
// 获取项目列表
const projects = await api.get<Project[]>("/projects");

// 创建项目
const newProject = await api.post<Project>("/projects", {
  name: "新项目",
  description: "项目描述"
});

// 更新项目
await api.patch(`/projects/${id}`, { name: "更新的名称" });

// 删除项目
await api.delete(`/projects/${id}`);
```

---

### 6. apps/web/app/layout.tsx - 全局布局

**【Java 对比】** 类似 JSP 的 layout 模板或 Thymeleaf 的 layout

```tsx
/**
 * 全局布局组件
 *
 * 【React 组件】
 * - React 组件类似 Java 类，但用于渲染 UI
 * - props 类似构造函数参数
 * - JSX 是 JavaScript 的 XML 扩展，类似模板语法
 */
export default function RootLayout({
  children  // 子页面内容
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <title>报销系统</title>
      </head>
      <body>
        {/* 顶部导航栏 */}
        <Header />

        {/* 主内容区域 */}
        <main>
          {children}  {/* 插入子页面 */}
        </main>

        {/* 底部导航 */}
        <BottomNav />
      </body>
    </html>
  );
}
```

**关键概念：**
- `{children}` - 插槽，插入子组件
- `<Component />` - JSX 语法，渲染组件
- `export default` - 默认导出（Next.js 要求）

---

### 7. apps/web/app/login/page.tsx - 登录页面

**【React Hooks 重点讲解】**

```tsx
"use client";  // 声明为客户端组件（在浏览器运行）

import { useState } from "react";

export default function LoginPage() {
  /**
   * useState Hook - 状态管理
   *
   * 【Java 对比】类似类的成员变量：
   * ```java
   * private String email = "";
   * public void setEmail(String value) {
   *     this.email = value;
   *     // 触发UI重新渲染
   * }
   * ```
   */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * 处理登录
   *
   * 【async/await】类似 Java 的 CompletableFuture：
   * ```java
   * CompletableFuture.supplyAsync(() -> api.login(email, password))
   *     .thenAccept(response -> saveToken(response.accessToken))
   *     .exceptionally(error -> showError(error));
   * ```
   */
  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await api.post("/auth/login", {
        emailOrPhone: email,
        password
      });

      // 保存令牌
      localStorage.setItem("accessToken", response.accessToken);

      // 跳转到首页
      router.push("/");
    } catch (error) {
      alert("登录失败");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 渲染 UI
   *
   * 【JSX】类似模板语法，但是 JavaScript 表达式：
   * - {} 中可以写任何 JS 表达式
   * - className 对应 HTML 的 class
   * - onClick 对应 onclick 事件
   */
  return (
    <div className="login-container">
      <h1>登录</h1>

      {/* 输入框 - value 绑定状态，onChange 更新状态 */}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="邮箱或手机号"
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
      />

      {/* 按钮 - disabled 属性动态绑定 */}
      <button
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? "登录中..." : "登录"}
      </button>
    </div>
  );
}
```

**关键概念：**
- `useState` - 状态变量，改变时触发 UI 重新渲染
- 事件处理 - `onClick`, `onChange` 等
- 条件渲染 - `{loading ? "A" : "B"}`
- 数据绑定 - `value={state}` + `onChange={setState}`

---

### 8. apps/web/components/Button.tsx - 按钮组件

**【组件复用】** 类似自定义 JSP 标签

```tsx
/**
 * 按钮组件
 *
 * 【props】类似 Java 方法参数或构造函数参数：
 * ```java
 * public class Button {
 *     private String text;
 *     private Consumer<Void> onClick;
 *     private boolean disabled;
 *
 *     public Button(String text, Consumer<Void> onClick, boolean disabled) {
 *         this.text = text;
 *         this.onClick = onClick;
 *         this.disabled = disabled;
 *     }
 * }
 * ```
 */
type ButtonProps = {
  text: string;           // 按钮文字
  onClick: () => void;    // 点击事件（类似 Consumer）
  disabled?: boolean;     // 是否禁用（可选）
  variant?: "primary" | "secondary";  // 样式变体
};

export default function Button({
  text,
  onClick,
  disabled = false,
  variant = "primary"
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {text}
    </button>
  );
}
```

**使用组件：**
```tsx
// 在其他组件中使用
<Button
  text="登录"
  onClick={handleLogin}
  disabled={loading}
  variant="primary"
/>
```

---

## Worker 后台任务

### 9. apps/worker/src/index.ts - 任务调度器

**【Java 对比】** 类似 Spring Batch 或 Quartz

```typescript
/**
 * 任务调度器
 *
 * 【轮询机制】类似：
 * ```java
 * @Scheduled(fixedDelay = 5000)
 * public void processJobs() {
 *     List<Job> jobs = jobRepository.findPendingJobs();
 *     for (Job job : jobs) {
 *         processJob(job);
 *     }
 * }
 * ```
 */
async function pollJobs() {
  while (true) {
    try {
      // 从数据库获取待处理任务
      const jobs = await db.query.backendJobs.findMany({
        where: eq(backendJobs.status, "pending"),
        limit: 10
      });

      // 处理每个任务
      for (const job of jobs) {
        await processJob(job);
      }

      // 等待 5 秒后继续
      await sleep(5000);
    } catch (error) {
      console.error("任务处理失败:", error);
      await sleep(10000);  // 失败后等待更长时间
    }
  }
}

/**
 * 处理单个任务
 */
async function processJob(job: BackendJob) {
  // 更新状态为处理中
  await db.update(backendJobs)
    .set({ status: "processing" })
    .where(eq(backendJobs.jobId, job.jobId));

  try {
    // 根据任务类型调用不同处理器
    if (job.type === "export") {
      await exportJob(job);
    } else if (job.type === "batch_check") {
      await batchCheckJob(job);
    }

    // 标记为完成
    await db.update(backendJobs)
      .set({ status: "completed" })
      .where(eq(backendJobs.jobId, job.jobId));
  } catch (error) {
    // 标记为失败
    await db.update(backendJobs)
      .set({
        status: "failed",
        error: error.message
      })
      .where(eq(backendJobs.jobId, job.jobId));
  }
}

// 启动任务调度器
pollJobs();
```

---

## 关键概念速查表

| 概念 | TypeScript/JavaScript | Java 等价 | 说明 |
|-----|----------------------|-----------|------|
| **异步处理** | `async/await` | `CompletableFuture` | 非阻塞异步操作 |
| **Promise** | `Promise<T>` | `Future<T>` | 异步操作的容器 |
| **模块导入** | `import { X } from "y"` | `import x.y.X;` | ES6 模块系统 |
| **模块导出** | `export const x` | `public static final` | 导出常量 |
| **解构** | `const { id, name } = user` | `user.getId(), user.getName()` | 提取字段 |
| **箭头函数** | `(x) => x + 1` | `x -> x + 1` | Lambda 表达式 |
| **可选参数** | `name?: string` | `@Nullable String name` | 可为空 |
| **联合类型** | `"a" \| "b"` | `enum { A, B }` | 限定值 |
| **中间件** | `app.use(middleware)` | `Filter` / `Interceptor` | 请求拦截 |
| **组件** | `<Component />` | 无直接对应 | UI 复用单元 |
| **状态** | `useState(0)` | 类成员变量 + 触发渲染 | 响应式数据 |

---

## 学习建议

**第1周：后端代码**
1. ✅ 已理解：config.ts, schema.ts, services/auth.ts, middleware/auth.ts
2. 建议阅读：routes/auth.ts → routes/projects.ts → db/client.ts
3. 动手实践：尝试添加一个新的 API 端点

**第2周：前端基础**
1. 建议阅读：lib/api.ts → app/layout.tsx → app/login/page.tsx
2. 理解重点：useState Hook, async/await, JSX 语法
3. 动手实践：修改登录页面的样式或文案

**第3周：进阶功能**
1. 建议阅读：components/Button.tsx → app/projects/page.tsx
2. 理解重点：组件复用、条件渲染、列表渲染
3. 动手实践：创建一个新的组件

**第4周：完整流程**
1. 跟踪一个完整的请求流程：登录 → 获取项目列表 → 创建项目
2. 理解数据如何从前端 → API → 数据库 → API → 前端
3. 动手实践：实现一个完整的 CRUD 功能

---

## 需要帮助？

如果对某个文件或概念不理解，请告诉我：
- "解释 XXX 文件中的 YYY 部分"
- "XXX 概念与 Java 的 YYY 有什么区别"
- "如何实现 XXX 功能"

我会提供更详细的说明和示例！
