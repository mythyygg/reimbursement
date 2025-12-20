# 文档说明与索引

- PRD 核心：`prd_core.md`
- UI/视觉与原型：`prd_ui.md`、`ui_prototype/*`
- 接口草案：`openapi.yaml`（组件拆分文件同目录）
- 全栈方案：`fullstack_plan.md`

---

# 文档目录

A) 交互状态对齐说明（Receipt Card、Expense Drawer、Batch Issues）：**核心状态 + 触发条件 + 后端动作**
B) 导出模板与命名规则细则：**CSV 默认字段集/排序/编码、附件打包策略、多附件处理、PDF 索引页结构与编号规则**
C) 后端方案（Backend Plan）：**架构、数据模型、核心流程、API、队列与安全策略**

---

# A) 交互状态对齐说明

用于前后端与测试对齐关键交互状态、触发条件与后端动作，避免歧义。

## A1. Receipt Card（票据卡片）

| 阶段 | UI 状态                                                       | 触发/条件          | 后端字段/动作                       |
| ---- | ------------------------------------------------------------- | ------------------ | ----------------------------------- |
| 上传 | `UPLOADING` / `UPLOAD_FAILED`                                 | 创建占位、直传失败 | `upload_status` 写入；失败可重试    |
| OCR  | `OCR_PENDING` / `OCR_PROCESSING` / `OCR_FAILED` / `OCR_READY` | OCR 队列或前端 OCR | `ocr_status`、`ocr_source`、`ocr_*` |
| 候选 | `SUGGESTING` / `SUGGESTIONS_AVAILABLE`                        | OCR 写入或字段编辑 | 计算候选 Top3（或缓存）             |
| 匹配 | `MATCHING` / `MATCHED` / `MATCH_FAILED`                       | 确认绑定           | `PATCH /receipts/{id}/match`        |
| 解除 | `UNMATCHING`                                                  | 解除绑定           | 解除关联并刷新状态                  |

## A2. Expense Drawer（支出详情抽屉）

| 阶段       | UI 状态                  | 触发/条件         | 后端字段/动作          |
| ---------- | ------------------------ | ----------------- | ---------------------- |
| 查看/编辑  | `OPEN_VIEW` / `EDITING`  | 用户打开/编辑字段 | 本地状态，保存时更新   |
| 保存       | `SAVING` / `SAVE_FAILED` | 点保存            | `PATCH /expenses/{id}` |
| 绑定票据   | `ATTACHING` / `MATCHING` | 从收纳箱选择      | 写入 `expense_receipt` |
| 解除       | `UNMATCHING`             | 解除关联          | 删除关联，重算状态     |
| 未保存离开 | `DIRTY_CONFIRM`          | 关闭抽屉          | 前端确认弹窗           |

## A3. Batch Issues（批次问题清单）

| 阶段     | UI 状态                  | 触发/条件        | 后端字段/动作        |
| -------- | ------------------------ | ---------------- | -------------------- |
| 检查中   | `CHECKING`               | 进入批次或点刷新 | 运行检查任务         |
| 有问题   | `CHECK_READY.HAS_ISSUES` | 缺票/重复/不一致 | 生成问题清单         |
| 无问题   | `CHECK_READY.NO_ISSUES`  | 无问题           | 允许直接导出         |
| 导出中   | `EXPORTING_*`            | 点导出           | 创建 `export_record` |
| 导出失败 | `EXPORT_FAILED`          | 生成失败         | 记录原因、允许重试   |

---

# B) 导出字段模板与命名规则细则

## B1. CSV 导出模板（默认字段集 + 顺序 + 规则）

### 1) 默认字段集（推荐最小可用 + 可配置扩展）

**建议默认列（按顺序）**

1. `序号`（Batch 内自增，从 001 开始）
2. `项目`（project.name 或 project.code）
3. `日期`（expense.date，YYYY-MM-DD）
4. `金额`（expense.amount，保留 2 位）
5. `类别`（expense.category；空则 `-`）
6. `事项备注`（expense.note）
7. `状态`（缺票/已关联/不需票）
8. `票据数量`（receipt_ids.length）
9. `票据文件名列表`（导出命名后的文件名，用 `;` 分隔）
10. `票据OCR金额`（可选：若有多个票据，用 `;` 分隔；默认可关闭）
11. `票据OCR日期`（可选，同上）
12. `商户关键字`（可选，同上）
13. `支出ID`（内部追溯，可选默认关闭）
14. `票据ID列表`（内部追溯，可选默认关闭）

> 默认建议开启到第 9 列即可；10–14 属于“排查/对账”增强列，可在设置中启用。

### 2) CSV 编码与格式

- 编码：**UTF-8 with BOM**（兼容 Excel 打开中文不乱码）
- 分隔符：`,`（逗号）
- 换行：`\r\n`
- 金额：两位小数（例如 1000.00）
- 日期：统一 `YYYY-MM-DD`
- 文本字段：包含逗号/引号/换行时按 RFC4180 加双引号转义

### 3) CSV 行排序（默认）

- 先按：`日期 asc`
- 再按：`序号 asc`（稳定）
- 或者按你习惯：`日期 desc`（可在导出设置里选择）

> 建议默认 `日期 asc`，更贴近报销单整理顺序。

---

## B2. ZIP 附件包：结构、命名、编号、一对多处理

### 1) ZIP 包结构（推荐）

```
/{BatchName}/
  /receipts/
    001_2025-12-20_100.00_交通_去棚_d3f1.jpg
    002_2025-12-20_58.00_餐饮_午饭_91aa.png
  batch.csv
  index.pdf（可选）
```

### 2) 文件命名规则（稳定可追溯）

**默认：**
`{序号}_{日期}_{金额}_{类别}_{备注前20字}_{票据ID短码}.{ext}`

**规则细则**

- `序号`：3 位补零 `001`
- `日期`：`YYYY-MM-DD`
- `金额`：两位小数
- `类别`：取枚举中文（交通/餐饮…）；空则 `其他`
- `备注前20字`：

  - 仅保留中文/英文/数字/空格，其他符号替换为 `_`
  - 过长截断；空则 `-`

- `票据ID短码`：receipt_id 的后 4–6 位或 hash 前 6 位
- 扩展名：保留原始文件 ext

**文件名长度控制**

- 建议最长 120 字符；超出时进一步截断备注

### 3) 一笔支出多附件（0..n）策略

**默认允许一笔支出绑定多票据**（例如餐饮分开发票、交通多段行程）。
此时**一个序号对应多个文件**，处理方式：

- CSV：同一序号行中 `票据数量 > 1`，`票据文件名列表` 用 `;` 分隔
- ZIP：文件名加“子序号”后缀，保证唯一：

  - `001a_...jpg`, `001b_...png`, `001c_...pdf`
  - 子序号：a,b,c…（超过 26 用 aa/ab）

**一张票据只允许匹配一个支出**（避免一票多用）。

### 4) 票据未匹配但要导出（是否包含）

- 默认：ZIP 只导出“批次筛选范围内的支出所绑定票据”
- 可选开关：`包含未匹配票据（收纳箱）`（默认关闭）

  - 主要用于“先打包再手动上传”的人群，但容易混乱

---

## B3. PDF 汇总索引页（Index PDF）结构

### 1) PDF 目的

- 给你在公司系统上传/核对时提供“序号 ↔ 支出 ↔ 票据文件名”对照
- 当 ZIP 内附件较多时，PDF 是最省脑的导航页

### 2) PDF 内容结构（建议 3 段）

**封面/摘要（第一页上半）**

- 批次名称
- 项目
- 日期范围
- 导出时间
- 条目数、缺票数、重复数、不一致数（如果导出时仍有问题）

**条目索引表（核心，多页）**
表头（固定）：

- 序号
- 日期
- 金额
- 类别
- 事项备注（截断 20–30 字）
- 票据文件名（可多行，最多显示 2 行；超出用 “+N”）

**问题清单（可选附录）**

- 若导出时存在问题：附上“缺票/重复/不一致”列表（只列序号与摘要，便于回查）

### 3) 编号与分页规则

- 每条支出序号固定，不因票据数量变化而变
- 表格每页建议 12–18 行（视字体大小）
- 票据文件名过长：换行 + 截断，保留后缀与短码

---

## B4. 导出选项（设置项建议）

- `CSV 字段模板`：勾选列、列顺序拖拽（后续）
- `排序`：日期升序/降序
- `ZIP 结构`：是否按类别分文件夹（默认不分）
- `PDF`：是否生成索引页（默认开启）
- `严格模式（后续）`：存在缺票/重复是否阻断导出

---

# 交付给开发/测试的“关键用例清单”（用于验证状态机 + 导出）

1. 票据上传失败 → 重试 → 成功 →OCR→ 候选 → 确认匹配
2. OCR 失败 → 手填金额/日期 → 候选出现 → 匹配
3. 已关联票据 → 更换匹配 → 原子换绑成功
4. 一笔支出绑定 2 张票据 →ZIP 文件名 `001a/001b` → CSV 文件名列表一致
5. 批次存在缺票/重复/不一致 → 检查清单正确 → 仍可导出 →PDF 附录列出问题
6. CSV 用 Excel 打开不乱码（UTF-8 BOM）
7. 附件命名在 Windows/macOS 解压均合法（非法字符替换）

# C) 后端方案（Backend Plan）

> 本文补充 PRD 与 UI 原型的后端实现方案，覆盖架构、数据模型、核心流程、API、任务队列、导出与安全策略。

## 0. 目标与范围

**目标**

- 支撑 PWA 移动端高频录入、票据上传、OCR、智能匹配、批次检查、导出。
- 保证票据文件安全可追溯、匹配关系一致性、导出结果稳定可复现。
- 支持弱网与重复提交场景（离线队列 + 幂等）。

**范围内**

- API 服务、对象存储、异步任务（OCR/导出/检查）、基础鉴权。
- 只做项目维度数据隔离（不含组织/协作权限扩展）。

**范围外**

- 企业级审批流、预算报表体系、合同/供应商管理。

---

## 1. 总体架构（建议）

**形态**：单体 API 服务 + 异步任务 Worker + 对象存储（文件）+ 关系型数据库（云部署）。  
**动机**：业务边界清晰，迭代快，满足 1–2 个团队的开发规模；后续可拆分 OCR/导出服务。

**核心组件**

- API 服务：鉴权、项目/支出/票据/批次/导出/设置读写。
- Worker 服务：OCR 识别、候选匹配刷新、批次检查、导出文件生成。
- 数据库：事务一致性、复杂筛选、索引支持。
- 对象存储：S3 兼容存储（票据文件、导出 ZIP/PDF、缩略图）。
- OCR 适配层：前端 OCR 优先，失败后回落到第三方 OCR（供应商待定）。

**约束与策略**

- 鉴权：密码登录 + 微信第三方登录，多端单点登录（新登录挤掉旧会话）。
- 令牌：短期 Access Token + Refresh Token（服务端可撤销）。
- 导出文件保留：3 天自动过期删除。
- 下载与导出行为需要留痕（Download Log）。

---

## 2. 数据模型与约束（建议）

> 实体均带 `user_id` 以保证数据隔离。时间字段使用 UTC 存储，前端展示本地化。

### 2.1 User

- `user_id`
- `email_or_phone`（登录标识）
- `password_hash`（密码登录）
- `wechat_openid`?, `wechat_unionid`?（微信登录）
- `session_version`（用于单点登录失效旧会话）
- `status`（active/disabled）
- `created_at`, `updated_at`

### 2.2 Project

- `project_id`, `user_id`
- `name`?, `code`?（二选一必填）
- `pinned`（bool）
- `archived`（bool）
- `tags`（json/array）
- `created_at`, `updated_at`

**索引**：`user_id, updated_at`；`user_id, pinned, updated_at`

### 2.3 Expense

- `expense_id`, `user_id`, `project_id`
- `date`, `amount`, `category`?, `note`
- `status`：`missing_receipt | matched | no_receipt_required`
- `manual_status`（bool，用于区分手动设为 no_receipt_required）
- `client_request_id`（幂等）
- `created_at`, `updated_at`

**索引**：`project_id, status, date`；`project_id, updated_at`

### 2.4 Receipt

- `receipt_id`, `user_id`, `project_id`
- `file_url`, `file_ext`, `file_size`
- `hash`（用于重复检测）
- `upload_status`：`pending | uploaded | failed`
- `ocr_status`：`pending | processing | ready | failed | disabled`
- `ocr_source`：`frontend | tencent | aliyun | baidu | huawei | none`
- `ocr_confidence`?（0-1）
- `ocr_amount`?, `ocr_date`?, `merchant_keyword`?
- `receipt_amount`?（手动修正）
- `receipt_date`?（手动修正）
- `receipt_type`?（交通/餐饮/其他）
- `matched_expense_id`?（一张票据只允许匹配一笔支出）
- `created_at`, `updated_at`, `deleted_at`?

**索引**：`project_id, matched_expense_id`；`project_id, hash`；`project_id, updated_at`

### 2.5 Expense_Receipt（一笔支出可多票据）

- `expense_id`, `receipt_id`
- `created_at`

**约束**

- `receipt_id` 唯一（防止一票多用）
- `expense_id` 可重复（允许多票据）

### 2.6 Batch

- `batch_id`, `user_id`, `project_id`
- `name`
- `filter_json`（日期范围/状态/类别）
- `issue_summary_json`（缺票/重复/不一致统计）
- `created_at`, `updated_at`

### 2.7 Batch_Issue（可选落库）

- `issue_id`, `batch_id`, `type`, `severity`
- `expense_id`?, `receipt_id`?
- `message`（前端展示）
- `created_at`

### 2.8 Export_Record

- `export_id`, `batch_id`, `user_id`
- `type`：`csv | zip | pdf`
- `status`：`pending | running | done | failed`
- `file_url`?, `file_size`?
- `expires_at`（导出文件过期时间）
- `created_at`, `updated_at`

### 2.9 Settings

- `user_id`
- `ocr_enabled`（全局）
- `ocr_fallback_enabled`（前端失败后后端 OCR）
- `ocr_provider_preference`（供应商优先级配置）
- `match_rules_json`（日期窗口、金额容差、类别规则）
- `export_template_json`
- `updated_at`

### 2.10 Auth_Session

- `session_id`, `user_id`
- `refresh_token_hash`
- `device_info`, `user_agent`, `ip`
- `expires_at`, `last_seen_at`
- `revoked_at`

### 2.11 Upload_Session（可选）

- `upload_id`, `receipt_id`, `user_id`
- `signed_url`, `expire_at`
- `storage_key`, `content_type`, `max_size`
- `status`：`created | completed | failed`

### 2.12 Download_Log

- `download_id`, `user_id`
- `file_type`：`receipt | export`
- `file_id`（receipt_id 或 export_id）
- `ip`, `user_agent`
- `created_at`

---

## 3. 核心流程（后端视角）

### 3.1 鉴权与会话

- 密码登录：用户输入账号 + 密码，后端校验 `password_hash`。
- 微信登录：前端拿到 `code` 后传给后端换取 `openid/unionid`，无账号则自动创建或绑定。
- 登录成功：签发 Access Token（短期）+ Refresh Token（长期），Refresh Token 哈希存储在 `auth_session`。
- 多端单点登录：登录时更新 `user.session_version` 并撤销旧会话（或清理同 user_id 的 session）。
- Refresh：用 refresh token 换取新 access token，同时轮换 refresh token。

### 3.2 票据上传与入库

1. 前端创建 Receipt（`POST /receipts`），返回 `receipt_id`。
2. 后端生成签名上传 URL（`POST /receipts/{id}/upload-url`）。
3. 前端直传对象存储，回传 `file_url, hash, size` 完成入库。
4. 后端写入 `receipt.upload_status=uploaded`；若 OCR 开启，创建 OCR 任务并置 `ocr_status=pending`。
5. 去重检测：基于 `hash` 找同项目相同 hash，仅提示不阻断。

**注意**

- 上传完成回调必须带 `client_request_id`，避免重复创建。
- 上传失败可重试，Receipt 保留 `upload_status=failed`。
- 存储路径建议：`users/{user_id}/projects/{project_id}/receipts/{receipt_id}.{ext}`。

### 3.3 OCR 任务与字段回填

- 前端 OCR 成功：写入 `ocr_*`，`ocr_source=frontend`，进入候选匹配。
- 前端 OCR 失败或低置信：触发后端 OCR 任务（`ocr_fallback_enabled=true`）。
- 后端 OCR 供应商：按 `settings.ocr_provider_preference` 顺序尝试，失败则降级下一家。
- 低置信阈值：默认 0.6，可在设置中调整。
- Worker 拉取 `ocr_status=pending` 的 Receipt。
- OCR 结果写入 `ocr_amount/ocr_date/merchant_keyword`，状态置 `ready`。
- OCR 失败或超时：`ocr_status=failed`，前端允许手动填字段。
- 用户编辑 OCR 字段后，触发候选匹配刷新。

### 3.4 候选匹配刷新

**触发时机**

- 票据上传完成或 OCR 字段更新。
- 支出金额/日期/类别变更。

**计算规则（与 PRD 一致）**

- 同项目；日期 ±3 天（默认）；金额相等（默认容差 0/0.01）；类别一致优先。
- 输出 Top 3 + 置信度（高/中/低）。

**存储策略**

- 可实时计算返回；或写入 `suggestions_json` 供前端快速拉取。

### 3.5 匹配与解除

- 匹配时使用事务：
  1. 校验 `receipt.matched_expense_id` 是否为空或为同一支出。
  2. 写入 `receipt.matched_expense_id = expense_id`。
  3. 写入 `expense_receipt` 关联。
  4. 同步更新 `expense.status`（除非 `manual_status=true`）。
- 解除匹配：删除关联、清空 `matched_expense_id`，重新计算 `expense.status`。

### 3.6 批次检查

- 输入：`filter_json`（日期范围、状态、类别）。
- 输出：缺票、重复、金额不一致、OCR 缺字段（可选）。
- 结果可落库至 `Batch_Issue`，也可实时计算。

### 3.7 导出生成

- 创建导出任务（CSV/ZIP/PDF）后进入 `Export_Record`，交由 Worker 生成。
- CSV 规则、ZIP 命名、PDF 索引页结构遵循本文件 B)。
- 生成完成写回 `file_url`，前端通过签名下载。
- 导出文件保留 3 天，到期后由定时任务清理存储与记录。

---

### 3.8 异步任务与队列策略（建议）

- OCR：以 `receipt_id` 为幂等键，最多重试 3 次，指数退避。
- 导出：以 `export_id` 为幂等键，失败可重试，生成失败记录错误原因。
- 批次检查：支持手动触发重检查，旧结果标记为过期。
- 队列阻塞：连续失败进入隔离队列或告警，避免无限重试。

---

## 4. API 设计（v1，示例）

> 路径示例以 `/api/v1` 为前缀，返回 JSON。列表接口建议游标分页。
> 字段与枚举请以 `openapi.yaml` 为准。

### 4.1 鉴权与用户

- `POST /auth/password/register`
- `POST /auth/password/login`
- `POST /auth/wechat/authorize`（返回授权 URL）
- `POST /auth/wechat/login`（code 换取会话）
- `POST /auth/refresh`
- `POST /auth/logout`（当前会话）
- `POST /auth/logout-all`（注销其他设备）
- `GET /me`

### 4.2 项目

- `GET /projects?search=&archived=&pinned=`
- `POST /projects`
- `PATCH /projects/{project_id}`
- `POST /projects/{project_id}/archive`

### 4.3 支出

- `GET /projects/{project_id}/expenses?status=&category=&date_from=&date_to=`
- `POST /projects/{project_id}/expenses`（支持 `client_request_id` 幂等）
- `PATCH /expenses/{expense_id}`
- `GET /expenses/{expense_id}/receipt-candidates`

### 4.4 票据

- `GET /projects/{project_id}/receipts?matched=&ocr_status=`
- `POST /projects/{project_id}/receipts`（创建占位）
- `POST /receipts/{receipt_id}/upload-url`
- `POST /receipts/{receipt_id}/complete`（提交 hash/size）
- `PATCH /receipts/{receipt_id}`（编辑 OCR 字段/手填字段）
- `PATCH /receipts/{receipt_id}/match`（绑定/更换/解除）
- `DELETE /receipts/{receipt_id}`
- `POST /receipts/{receipt_id}/download-url`（记录下载）

### 4.5 批次与检查

- `GET /projects/{project_id}/batches`
- `POST /projects/{project_id}/batches`
- `GET /batches/{batch_id}`
- `POST /batches/{batch_id}/check`（重新检查）

### 4.6 导出

- `POST /batches/{batch_id}/exports`（type: csv|zip|pdf）
- `GET /exports/{export_id}`
- `POST /exports/{export_id}/download-url`（记录下载）

### 4.7 设置

- `GET /settings`
- `PATCH /settings`

---

## 5. 安全与权限

**鉴权**

- Access Token（JWT，15-30 分钟）+ Refresh Token（7-30 天，可轮换）。
- Refresh Token 哈希存表，支持单点登录撤销。
- 密码使用 Argon2id 或 bcrypt 存储。
- 微信登录使用 OAuth2 授权码流程，后端换取 `openid/unionid`。

**文件访问**

- 票据与导出文件均走签名 URL（S3 兼容），短时有效期。
- 通过下载 URL 接口生成签名并记录 Download Log。
- 下载与导出记录包含 `user_id`、`ip`、`user_agent` 以便审计。

**删除策略**

- 软删除（`deleted_at`），默认 7 天可恢复。
- 导出文件 3 天过期清理，同时保留导出记录。

---

## 6. 一致性与幂等

**幂等**

- `client_request_id` 用于支出、票据创建，避免离线重试造成重复。
- 导出任务按 `{batch_id, type}` 限制并发（同类型存在 `running` 时拒绝新建）。

**事务**

- 匹配/解除必须在单事务内完成，避免一票多用或状态不同步。

---

## 7. 性能与容量

- 列表接口默认分页（cursor），按 `updated_at, id` 排序。
- 票据缩略图可按需生成（前端展示更快）。
- 大批次导出用后台任务，前端轮询 `export.status`。
- 建议限制单文件大小与数量（如 20MB/张、单批次 1000 笔）。

---

## 8. 错误码（建议）

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_WECHAT_CODE_INVALID`
- `TOKEN_EXPIRED`
- `SESSION_REVOKED`
- `PASSWORD_WEAK`
- `PROJECT_ARCHIVED`
- `EXPENSE_NOT_FOUND`
- `RECEIPT_NOT_FOUND`
- `RECEIPT_ALREADY_MATCHED`
- `UPLOAD_NOT_COMPLETE`
- `UPLOAD_URL_EXPIRED`
- `FILE_TOO_LARGE`
- `FILE_TYPE_NOT_ALLOWED`
- `OCR_DISABLED`
- `OCR_PROVIDER_UNAVAILABLE`
- `EXPORT_IN_PROGRESS`
- `EXPORT_EXPIRED`
- `BATCH_FILTER_INVALID`
- `DOWNLOAD_NOT_ALLOWED`

---

## 9. 与前端状态对齐

- `receipt.upload_status` → `UPLOADING / UPLOAD_FAILED / READY`
- `receipt.ocr_status` → `OCR_PENDING / OCR_PROCESSING / OCR_FAILED / OCR_READY`
- `export.status` → `EXPORTING / EXPORT_FAILED / DONE`
- `match` 相关错误码 → `MATCH_FAILED` Toast

---

## 10. 监控与日志（最低可用）

- 指标：上传成功率、OCR 成功率、导出成功率、匹配成功率。
- 日志：OCR 超时、导出失败原因、签名 URL 访问异常。
