# 全栈开发方案（Reimbursement Prep）

## 0. 目标与边界

**目标**
- 在手机端完成高频录入、票据收纳、匹配、批次检查与导出。
- 数据安全可追溯，导出文件保留 3 天，下载与导出行为留痕。
- 适配个人或少量用户（不含复杂组织权限）。

**边界**
- 不做审批流、预算报表、供应商与合同管理。
- 匹配必须人工确认，自动匹配只做建议。

---

## 1. 关键约束与已确认决策

- 鉴权：密码登录，多端单点登录。
- Token：短期 Access Token + 可撤销 Refresh Token（服务端会话表）。
- 对象存储：S3 兼容。
- 对象存储：S3 兼容。
- 导出文件保留 3 天，超期自动清理。
- 下载/导出记录必须保存。
- 前端：React/Next.js，PWA 优先，移动端体验为主。
- 后端：Node.js，云部署。

---

## 2. 技术栈与工程组织

### 2.1 前端
- 框架：Next.js（React）
- 状态与数据：TanStack Query（请求缓存）+ 轻量本地状态（Zustand 或 Context）
- 样式：Tailwind 或 CSS Modules（与现有 UI 原型一致即可）
- PWA：Service Worker + IndexedDB（离线队列）
- 文件处理：前端压缩/缩略图（可选）

### 2.2 后端
- 语言/框架：Node.js + TypeScript（Hono）
- 数据库：PostgreSQL
- ORM：Drizzle ORM + drizzle-kit
- 任务队列：基于数据库的任务表（导出/检查）
- 对象存储：S3 兼容（签名 URL 上传/下载）

### 2.3 项目结构（建议）
- `apps/web`：Next.js
- `apps/api`：API 服务
- `apps/worker`：异步任务
- `packages/shared`：类型、校验、通用工具

---

## 3. 后端设计要点（落地）

### 3.1 认证与会话
- 密码登录：Argon2id 或 bcrypt。
- Access Token：15-30 分钟；Refresh Token：7-30 天（可轮换）。
- 单点登录：登录时撤销旧会话或更新 `session_version`。

### 3.2 对象存储与文件策略
- 上传：后端签名 URL，前端直传，完成后回调。
- 存储路径：`users/{user_id}/projects/{project_id}/receipts/{receipt_id}.{ext}`。
- 下载：通过 API 生成签名 URL，并记录下载日志。
- 导出文件：生命周期规则 3 天自动删除。


### 3.4 匹配一致性
- 事务内完成绑定与解绑。
- 一票只绑定一支出；一支出可多票据。

---

## 4. 前端设计要点（落地）

### 4.1 PWA 与离线
- 录入与上传支持离线队列，恢复后自动重试。
- IndexedDB 存储待上传文件元数据与队列状态。

### 4.2 交互效率
- 快速录入固定底部输入条。
- 匹配在票据卡片完成，减少跳页。

---

## 5. 核心数据表（与 docs/techdesign.md 后端方案对齐）

- user, project, expense, receipt, expense_receipt
- batch, batch_issue（可选）
- export_record（含 expires_at）
- auth_session（refresh token）
- download_log（导出/下载留痕）

---

## 6. API 与 OpenAPI

- 见 `docs/openapi/openapi.yaml`（主入口）
- 组件拆分：`openapi_components_core.yaml`、`openapi_components_requests.yaml`

---

## 7. 异步任务设计

- Export Worker：生成 CSV/ZIP/PDF → 上传存储 → 写入 export_record。
- Check Worker：批次问题检查（缺票/重复/金额不一致）。

---

## 8. 部署与环境

### 8.1 云部署（建议）
- API + Worker：容器化部署（Docker），支持滚动升级。
- 数据库：云 PostgreSQL。
- 存储：S3 兼容对象存储。

### 8.2 环境配置
- `DATABASE_URL` / `S3_*` / `JWT_*`
- 供应商配置支持热切换与权重优先级。

---

## 9. 安全与合规

- 访问控制：所有资源按 `user_id` 校验。
- 速率限制：登录与上传接口限流。
- 审计日志：导出与下载记录保留。
- 数据保留：导出文件 3 天；软删除 7 天回收。

---

## 10. 监控与运维

- 指标：匹配成功率、导出成功率、上传失败率。
- 日志：导出失败原因、下载异常。

---

## 11. 开发里程碑（建议）

1. **MVP（2-3 周）**：项目/支出/票据上传/匹配/批次检查/CSV 导出。
2. **增强（2 周）**：候选匹配、ZIP/PDF 导出。
3. **稳定性（1-2 周）**：离线队列、失败重试、监控与日志。

---

## 12. 测试策略

- 单元测试：匹配规则、导出命名、错误码。
- 集成测试：上传-完成-匹配-导出链路。
- 端到端测试：移动端录入与导出流程。

---

## 13. 交付物清单

- `docs/techdesign.md`（含后端方案）
- `docs/openapi/openapi.yaml` + 组件文件
- `docs/fullstack_plan.md`（本文）
