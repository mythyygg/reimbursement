# JavaScript/前端概念速查手册 - 专为 Java 开发者

> 本手册解释项目中所有 Java 开发者可能不熟悉的概念，帮助您快速看懂代码

---

## 📋 目录

1. [JavaScript 异步编程](#1-javascript-异步编程)
2. [npm 包管理器](#2-npm-包管理器)
3. [模块系统](#3-模块系统)
4. [TypeScript 类型系统](#4-typescript-类型系统)
5. [箭头函数和解构](#5-箭头函数和解构)
6. [React 框架](#6-react-框架)
7. [Next.js 框架](#7-nextjs-框架)
8. [Drizzle ORM](#8-drizzle-orm)
9. [路由（Route）概念](#9-路由route概念)
10. [数据库迁移](#10-数据库迁移)
11. [常见文件类型](#11-常见文件类型)

---

## 1. JavaScript 异步编程

### 1.1 什么是 async/await？

**【Java 对比】** 类似 Java 的 CompletableFuture

```typescript
// ❌ 错误理解：这不是等待线程
// ✅ 正确理解：这是等待异步操作完成

// TypeScript/JavaScript
async function getUser(id: string) {
  const user = await db.query.users.findFirst();
  return user;
}

// Java 等价代码
CompletableFuture<User> getUserAsync(String id) {
    return CompletableFuture.supplyAsync(() ->
        userRepository.findById(id).orElseThrow()
    );
}
// 调用
User user = getUserAsync("123").get(); // 阻塞等待
```

**关键点：**
- `async` - 声明这是一个异步函数（返回 Promise）
- `await` - 等待异步操作完成（类似 `.get()`）
- 不会阻塞整个程序，只等待这一个操作

**为什么需要？**
- JavaScript 是单线程的
- 数据库查询、网络请求都是异步的
- 避免阻塞 UI 或其他操作

**常见场景：**
```typescript
// 场景1：数据库查询
const projects = await db.query.projects.findMany();

// 场景2：HTTP 请求
const response = await fetch("https://api.example.com/data");

// 场景3：文件操作
const file = await fs.readFile("data.txt");

// 场景4：等待延迟
await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
```

---

### 1.2 什么是 Promise？

**【Java 对比】** 类似 Java 的 Future

```typescript
// Promise 表示"未来的值"
const promise: Promise<User> = fetchUser("123");

// 两种使用方式：

// 方式1：使用 .then() (旧风格)
promise.then(user => {
  console.log(user.name);
});

// 方式2：使用 await (新风格，推荐)
const user = await promise;
console.log(user.name);
```

**Java 对比：**
```java
// Java Future
Future<User> future = executor.submit(() -> fetchUser("123"));
User user = future.get(); // 阻塞等待

// Java CompletableFuture
CompletableFuture<User> future = CompletableFuture.supplyAsync(() -> fetchUser("123"));
future.thenAccept(user -> System.out.println(user.getName()));
```

---

## 2. npm 包管理器

### 2.1 什么是 npm？

**【Java 对比】** npm = Maven + mvn 命令

- **npm** (Node Package Manager) - JavaScript 的包管理工具
- **package.json** - 类似 `pom.xml`，定义依赖和脚本
- **node_modules/** - 类似 `.m2/repository`，存放依赖包

### 2.2 npm 命令对照表

| npm 命令 | Maven 命令 | 作用 |
|---------|-----------|------|
| `npm install` | `mvn install` | 安装所有依赖 |
| `npm run dev` | `mvn spring-boot:run` | 启动开发服务器 |
| `npm run build` | `mvn package` | 构建项目 |
| `npm test` | `mvn test` | 运行测试 |

### 2.3 什么是 workspace？

**【Java 对比】** workspace = Maven 多模块项目

```json
// 根目录 package.json
{
  "workspaces": [
    "apps/*",      // 类似 <modules>
    "packages/*"
  ]
}
```

等同于 Maven 的：
```xml
<modules>
    <module>apps/api</module>
    <module>apps/web</module>
    <module>apps/worker</module>
</modules>
```

### 2.4 npm --workspace 命令详解

```bash
# 在特定子项目中运行命令

# 示例1：在 api 项目中运行数据库迁移
npm --workspace apps/api run db:migrate

# Java 等价
cd apps/api && mvn flyway:migrate

# 示例2：在 web 项目中启动开发服务器
npm --workspace apps/web run dev

# Java 等价
cd apps/web && mvn spring-boot:run
```

**分解解释：**
- `npm` - 调用 npm 工具
- `--workspace apps/api` - 指定在哪个子项目执行（类似 `cd apps/api`）
- `run db:migrate` - 运行 package.json 中定义的脚本

**对应的 package.json：**
```json
// apps/api/package.json
{
  "scripts": {
    "db:migrate": "tsx src/db/migrate.ts"
  }
}
```

类似 Maven 的：
```xml
<build>
    <plugins>
        <plugin>
            <executions>
                <execution>
                    <id>db-migrate</id>
                    <goals><goal>exec</goal></goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

---

## 3. 模块系统

### 3.1 import 和 export

**【Java 对比】** 类似 Java 的 import 和 public

```typescript
// ========== 导出 (export) ==========

// 文件: utils.ts

// 具名导出（类似 public class/method）
export function add(a: number, b: number) {
  return a + b;
}

export const PI = 3.14;

// 默认导出（类似主类）
export default class Calculator {
  // ...
}
```

```typescript
// ========== 导入 (import) ==========

// 文件: main.ts

// 导入具名导出（需要完全匹配名称）
import { add, PI } from "./utils";
// Java: import com.example.utils.add;

// 导入默认导出（可以任意命名）
import Calculator from "./utils";
import Calc from "./utils";  // 也可以
// Java: import com.example.Calculator;

// 导入全部
import * as Utils from "./utils";
// Java: import com.example.utils.*;
```

**关键区别：**

| JavaScript | Java |
|-----------|------|
| `export function foo()` | `public class Foo` |
| `export default class X` | 文件名即类名 |
| `import { foo } from "./file"` | `import com.package.Foo` |
| 一个文件可以多个 export | 一个文件一个 public class |

---

## 4. TypeScript 类型系统

### 4.1 interface vs type

**【Java 对比】** 都类似 Java interface，但仅用于编译时检查

```typescript
// interface（推荐用于对象）
interface User {
  id: string;
  name: string;
  email?: string;  // ? 表示可选，类似 @Nullable
}

// type（更灵活，可用于联合类型）
type Status = "pending" | "completed";  // 联合类型，类似枚举
type ID = string | number;  // 可以是字符串或数字
```

**Java 等价：**
```java
// interface User
public class User {
    private String id;
    private String name;
    @Nullable
    private String email;
}

// type Status
enum Status { PENDING, COMPLETED }
```

### 4.2 类型注解

```typescript
// 变量类型注解
const name: string = "张三";
const age: number = 25;
const isActive: boolean = true;

// 函数类型注解
function greet(name: string): string {
  return `Hello, ${name}`;
}

// 数组类型注解
const ids: string[] = ["1", "2", "3"];
const numbers: Array<number> = [1, 2, 3];
```

**Java 对比：**
```java
String name = "张三";
int age = 25;
boolean isActive = true;

String greet(String name) {
    return "Hello, " + name;
}

List<String> ids = Arrays.asList("1", "2", "3");
```

### 4.3 泛型

```typescript
// TypeScript 泛型
function findById<T>(id: string): Promise<T> {
  return db.query.findFirst<T>({ where: { id } });
}

// 使用
const user = await findById<User>("123");

// Java 等价
<T> T findById(String id) {
    return repository.findById(id);
}
```

---

## 5. 箭头函数和解构

### 5.1 箭头函数

**【Java 对比】** 类似 Java Lambda

```typescript
// 传统函数
function add(a, b) {
  return a + b;
}

// 箭头函数（简写）
const add = (a, b) => a + b;

// 如果有多行代码，需要花括号
const add = (a, b) => {
  const sum = a + b;
  return sum;
};

// 单个参数可省略括号
const double = x => x * 2;

// 无参数
const sayHi = () => console.log("Hi");
```

**Java Lambda 对比：**
```java
// Java Lambda
BiFunction<Integer, Integer, Integer> add = (a, b) -> a + b;

// 多行
BiFunction<Integer, Integer, Integer> add = (a, b) -> {
    int sum = a + b;
    return sum;
};
```

### 5.2 解构赋值

**【Java 对比】** 类似批量 getter 调用

```typescript
// ========== 对象解构 ==========

const user = { id: "1", name: "张三", age: 25 };

// 解构提取字段
const { id, name } = user;
// 等同于：
// const id = user.id;
// const name = user.name;

// Java "等价"（实际上Java没有这个语法）
String id = user.getId();
String name = user.getName();

// ========== 数组解构 ==========

const numbers = [1, 2, 3];
const [first, second] = numbers;
// first = 1, second = 2

// Java 等价
int first = numbers[0];
int second = numbers[1];

// ========== 函数参数解构 ==========

function greet({ name, age }: User) {
  console.log(`${name} is ${age} years old`);
}

// Java 等价
void greet(User user) {
    System.out.println(user.getName() + " is " + user.getAge());
}
```

---

## 6. React 框架

### 6.1 什么是 React？

**【概念】** React 是前端 UI 库，用于构建用户界面

**【Java 对比】** 没有直接对应，最接近的是：
- JSP 标签库（但更强大）
- Android View 系统（但在浏览器中）

### 6.2 组件（Component）

**【核心概念】** 组件 = 可复用的 UI 单元

```tsx
// 组件定义（函数组件）
function Button({ text, onClick }: { text: string; onClick: () => void }) {
  return <button onClick={onClick}>{text}</button>;
}

// 使用组件
<Button text="点击我" onClick={() => alert("Clicked!")} />
```

**理解为：**
```java
// 如果Java有组件概念（伪代码）
public class Button {
    private String text;
    private Runnable onClick;

    public Button(String text, Runnable onClick) {
        this.text = text;
        this.onClick = onClick;
    }

    public String render() {
        return "<button onclick='" + onClick + "'>" + text + "</button>";
    }
}
```

### 6.3 JSX 语法

**【概念】** JSX = JavaScript + XML，在 JS 中写 HTML

```tsx
// JSX 代码
const element = (
  <div className="container">
    <h1>Hello, {name}!</h1>
    <button onClick={handleClick}>Click</button>
  </div>
);

// 实际上会被编译成：
const element = React.createElement(
  "div",
  { className: "container" },
  React.createElement("h1", null, "Hello, ", name, "!"),
  React.createElement("button", { onClick: handleClick }, "Click")
);
```

**关键点：**
- `{}` 中可以写 JavaScript 表达式
- `className` 而不是 `class`（因为 class 是 JS 关键字）
- `onClick` 而不是 `onclick`（驼峰命名）

### 6.4 useState Hook

**【核心概念】** useState = 组件的状态变量

**【Java 对比】** 类似类的成员变量，但改变时会触发 UI 重新渲染

```tsx
import { useState } from "react";

function Counter() {
  // 声明状态变量
  const [count, setCount] = useState(0);
  //     ↑        ↑           ↑
  //   当前值   更新函数    初始值

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  );
}
```

**Java "等价"（伪代码）：**
```java
public class Counter {
    private int count = 0;  // 状态

    public void setCount(int newValue) {
        this.count = newValue;
        this.reRender();  // 自动重新渲染UI
    }
}
```

**重要规则：**
- ❌ 不要直接修改：`count = count + 1`
- ✅ 必须使用 setter：`setCount(count + 1)`
- 原因：只有通过 setter，React 才知道状态变了，需要重新渲染

### 6.5 useEffect Hook

**【概念】** useEffect = 副作用处理（类似生命周期方法）

**【Java 对比】** 类似 Spring 的 @PostConstruct

```tsx
import { useEffect } from "react";

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);

  // 组件加载后执行（类似 @PostConstruct）
  useEffect(() => {
    // 获取用户数据
    fetchUser(userId).then(data => setUser(data));

    // 清理函数（可选，类似 @PreDestroy）
    return () => {
      console.log("组件卸载");
    };
  }, [userId]);  // 依赖数组：userId 变化时重新执行

  return <div>{user?.name}</div>;
}
```

**Java "等价"：**
```java
@Component
public class UserProfile {
    @PostConstruct
    public void init() {
        User user = fetchUser(userId);
        this.user = user;
    }

    @PreDestroy
    public void cleanup() {
        System.out.println("组件卸载");
    }
}
```

---

## 7. Next.js 框架

### 7.1 什么是 Next.js？

**【概念】** Next.js = React 框架 + 路由 + SSR

**【Java 对比】** 类似 Spring MVC，但是为前端设计

### 7.2 基于文件的路由

**【重要】** 文件结构即路由结构（不需要配置）

```
app/
├── page.tsx           → /          (首页)
├── about/
│   └── page.tsx       → /about     (关于页)
├── login/
│   └── page.tsx       → /login     (登录页)
└── projects/
    ├── page.tsx       → /projects  (项目列表)
    └── [id]/
        └── page.tsx   → /projects/:id  (单个项目)
```

**Java 对比：**
```java
// Java 需要手动配置路由
@RestController
public class ProjectController {
    @GetMapping("/")
    public String home() { ... }

    @GetMapping("/about")
    public String about() { ... }

    @GetMapping("/login")
    public String login() { ... }

    @GetMapping("/projects")
    public String projects() { ... }

    @GetMapping("/projects/{id}")
    public String project(@PathVariable String id) { ... }
}
```

### 7.3 layout.tsx

**【概念】** layout = 共享布局（类似模板）

```tsx
// app/layout.tsx - 全局布局
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Header />       {/* 顶部导航，所有页面共享 */}
        <main>
          {children}     {/* 子页面内容插入这里 */}
        </main>
        <Footer />       {/* 底部，所有页面共享 */}
      </body>
    </html>
  );
}
```

**Java 对比：**
```jsp
<!-- layout.jsp -->
<%@ include file="header.jsp" %>
<main>
    <%= content %>  <!-- 子页面内容 -->
</main>
<%@ include file="footer.jsp" %>
```

### 7.4 "use client" 指令

**【重要】** 声明组件在浏览器运行

```tsx
"use client";  // 必须在文件第一行

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  // ... 使用浏览器功能（useState, 事件处理等）
}
```

**为什么需要？**
- Next.js 默认在服务器端渲染（SSR）
- `"use client"` 表示这个组件需要在浏览器运行
- 类似 Java 的服务端渲染 vs 客户端 JavaScript

**何时使用：**
- ✅ 使用 useState, useEffect
- ✅ 处理点击、输入等事件
- ✅ 使用浏览器 API（localStorage, window 等）
- ❌ 纯展示内容（服务端渲染更快）

---

## 8. Drizzle ORM

### 8.1 什么是 Drizzle？

**【概念】** Drizzle = TypeScript ORM，类似 JPA/Hibernate

**【对比】**
| Drizzle | JPA/Hibernate |
|---------|--------------|
| `pgTable()` | `@Entity` |
| `db.query` | `EntityManager` |
| `db.insert()` | `em.persist()` |
| Type-safe | Annotation-based |

### 8.2 表定义

```typescript
// Drizzle 表定义
export const users = pgTable("users", {
  userId: uuid("user_id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow()
});
```

**Java JPA 等价：**
```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private String name;

    private String email;

    @Column(name = "created_at")
    @CreationTimestamp
    private Timestamp createdAt;
}
```

### 8.3 查询操作

```typescript
// ========== 查询单个 ==========
const user = await db.query.users.findFirst({
  where: eq(users.userId, "123")
});

// Java JPA
User user = em.createQuery("SELECT u FROM User u WHERE u.userId = :id", User.class)
    .setParameter("id", "123")
    .getSingleResult();

// ========== 查询多个 ==========
const allUsers = await db.query.users.findMany();

// Java JPA
List<User> users = em.createQuery("SELECT u FROM User u", User.class)
    .getResultList();

// ========== 条件查询 ==========
const activeUsers = await db.query.users.findMany({
  where: eq(users.status, "active")
});

// Java JPA
List<User> users = em.createQuery(
    "SELECT u FROM User u WHERE u.status = :status", User.class)
    .setParameter("status", "active")
    .getResultList();
```

### 8.4 插入操作

```typescript
// Drizzle 插入
await db.insert(users).values({
  name: "张三",
  email: "zhang@example.com"
});

// Java JPA
User user = new User();
user.setName("张三");
user.setEmail("zhang@example.com");
em.persist(user);
```

### 8.5 更新操作

```typescript
// Drizzle 更新
await db.update(users)
  .set({ name: "李四" })
  .where(eq(users.userId, "123"));

// Java JPA
User user = em.find(User.class, "123");
user.setName("李四");
em.merge(user);
```

### 8.6 JOIN 查询

```typescript
// Drizzle JOIN
const result = await db
  .select()
  .from(projects)
  .innerJoin(users, eq(projects.userId, users.userId));

// Java JPQL
List<Object[]> result = em.createQuery(
    "SELECT p, u FROM Project p INNER JOIN User u ON p.userId = u.userId"
).getResultList();
```

---

## 9. 路由（Route）概念

### 9.1 什么是路由（Route）？

**【概念】** 路由 = URL 到处理函数的映射

**【Java 对比】** 路由 = Spring MVC 的 @RequestMapping

### 9.2 后端路由（Hono）

```typescript
// Hono 路由定义
const app = new Hono();

app.get("/projects", (c) => {
  return c.json({ message: "获取项目列表" });
});

app.post("/projects", (c) => {
  return c.json({ message: "创建项目" });
});

app.get("/projects/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id });
});
```

**Java Spring MVC 等价：**
```java
@RestController
@RequestMapping("/projects")
public class ProjectController {

    @GetMapping
    public ResponseEntity<?> getProjects() {
        return ResponseEntity.ok(Map.of("message", "获取项目列表"));
    }

    @PostMapping
    public ResponseEntity<?> createProject() {
        return ResponseEntity.ok(Map.of("message", "创建项目"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getProject(@PathVariable String id) {
        return ResponseEntity.ok(Map.of("id", id));
    }
}
```

### 9.3 前端路由（Next.js）

**【重要】** Next.js 的路由基于文件结构（见 7.2 节）

---

## 10. 数据库迁移

### 10.1 什么是 migrate？

**【概念】** migrate = 数据库版本管理（类似 Flyway/Liquibase）

**【Java 对比】** Drizzle migrate = Flyway migrate

### 10.2 migrate.ts 文件在干什么？

```typescript
// apps/api/src/db/migrate.ts

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// 1. 连接数据库
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool);

// 2. 执行迁移（应用 SQL 脚本）
await migrate(db, {
  migrationsFolder: "./drizzle"  // 迁移文件目录
});

// 3. 关闭连接
await pool.end();
```

**Java Flyway 等价：**
```java
// FlywayMigration.java
public class FlywayMigration {
    public static void main(String[] args) {
        // 1. 配置数据源
        DataSource dataSource = new HikariDataSource(config);

        // 2. 创建 Flyway 实例
        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")  // 迁移文件目录
            .load();

        // 3. 执行迁移
        flyway.migrate();
    }
}
```

### 10.3 迁移文件结构

```
drizzle/
├── 0000_create_users_table.sql
├── 0001_create_projects_table.sql
└── 0002_add_email_to_users.sql
```

**类似 Flyway：**
```
db/migration/
├── V1__create_users_table.sql
├── V2__create_projects_table.sql
└── V3__add_email_to_users.sql
```

### 10.4 npm run db:migrate 在做什么？

```bash
npm --workspace apps/api run db:migrate
```

**执行步骤：**
1. 进入 `apps/api` 目录
2. 执行 `package.json` 中定义的 `db:migrate` 脚本
3. 脚本内容：`tsx src/db/migrate.ts`
4. 运行 migrate.ts 文件
5. 应用所有未执行的迁移脚本

**Java Maven 等价：**
```bash
cd apps/api && mvn flyway:migrate
```

或者：
```java
// Java 代码执行
public static void main(String[] args) {
    Flyway.configure()
        .dataSource(dataSource)
        .load()
        .migrate();
}
```

---

## 11. 常见文件类型

### 11.1 .ts 文件

**【概念】** .ts = TypeScript 文件

- TypeScript = JavaScript + 类型系统
- 类似 Java 有类型，但编译后变成 JavaScript
- `.ts` → 编译 → `.js`

### 11.2 .tsx 文件

**【概念】** .tsx = TypeScript + JSX（React 组件）

- 可以写 JSX 语法（在 JS 中写 HTML）
- 用于 React 组件

### 11.3 .js 文件

**【概念】** .js = 纯 JavaScript 文件

- 没有类型检查
- 浏览器直接运行

### 11.4 .json 文件

**【概念】** .json = JSON 配置文件

- `package.json` - 项目配置（类似 pom.xml）
- `tsconfig.json` - TypeScript 配置（类似 javac 选项）
- `vercel.json` - 部署配置

---

## 📚 快速参考表

### 语法速查

| JavaScript | Java | 说明 |
|-----------|------|------|
| `const` | `final` | 常量 |
| `let` | 无 | 变量 |
| `=>` | `->` | Lambda/箭头函数 |
| `await` | `.get()` | 等待异步 |
| `async` | `CompletableFuture` | 异步函数 |
| `?.` | `Optional` | 可选链 |
| `??` | `orElse()` | 空值合并 |
| `...` | 无 | 展开运算符 |
| `${}` | `String.format()` | 字符串插值 |

### 框架速查

| 前端 | Java 后端 | 说明 |
|------|----------|------|
| React | 无直接对应 | UI 库 |
| Next.js | Spring MVC | 全栈框架 |
| useState | 成员变量 + 渲染 | 状态管理 |
| useEffect | @PostConstruct | 生命周期 |
| Component | 无直接对应 | UI 组件 |
| Route | @RequestMapping | 路由映射 |
| Drizzle | JPA/Hibernate | ORM |

### 工具速查

| 前端工具 | Java 工具 | 说明 |
|---------|----------|------|
| npm | Maven | 包管理 |
| package.json | pom.xml | 依赖配置 |
| node_modules | .m2/repository | 依赖存储 |
| npm run | mvn exec | 运行脚本 |
| tsx | java | 运行器 |

---

## 🎯 学习建议

### 第1天：JavaScript 基础
1. 理解 async/await
2. 理解 Promise
3. 理解箭头函数
4. 理解解构赋值

### 第2-3天：React 基础
1. 理解组件概念
2. 理解 JSX 语法
3. 理解 useState
4. 理解 useEffect

### 第4-5天：Next.js
1. 理解基于文件的路由
2. 理解 layout.tsx
3. 理解 "use client"

### 第6-7天：Drizzle ORM
1. 理解表定义
2. 理解查询语法
3. 理解迁移概念

---

## ❓ 遇到不懂的怎么办？

### 看到不认识的语法

**例子1：** `const { id, name } = user`
→ 查找本手册：第5.2节 "解构赋值"

**例子2：** `await fetch(url)`
→ 查找本手册：第1.1节 "async/await"

**例子3：** `const [count, setCount] = useState(0)`
→ 查找本手册：第6.4节 "useState Hook"

### 看到不认识的命令

**例子1：** `npm run dev`
→ 查找本手册：第2.2节 "npm 命令"

**例子2：** `npm --workspace apps/api run db:migrate`
→ 查找本手册：第2.4节 "workspace 命令" + 第10.4节 "迁移命令"

### 看到不认识的文件

**例子1：** `migrate.ts`
→ 查找本手册：第10.2节 "migrate.ts"

**例子2：** `page.tsx`
→ 查找本手册：第7.2节 "基于文件的路由"

---

**现在您应该能看懂项目代码了！遇到问题随时查阅本手册！** 📖✨
