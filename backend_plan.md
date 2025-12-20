# 后端方案（Backend Plan）

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

**形态**：单体 API 服务 + 异步任务 Worker + 对象存储（文件）+ 关系型数据库。  
**动机**：业务边界清晰，迭代快，满足 1–2 个团队的开发规模；后续可拆分 OCR/导出服务。

**核心组件**
- API 服务：鉴权、项目/支出/票据/批次/导出/设置读写。
- Worker 服务：OCR 识别、候选匹配刷新、批次检查、导出文件生成。
- 数据库：事务一致性、复杂筛选、索引支持。
- 对象存储：票据文件、导出 ZIP/PDF、缩略图（可选）。
- OCR 适配层：支持本地/第三方 OCR 的统一接口与超时降级。

---

## 2. 数据模型与约束（建议）

> 实体均带 `user_id` 以保证数据隔离。时间字段使用 UTC 存储，前端展示本地化。

### 2.1 User
- `user_id`
- `email_or_phone`（登录标识）
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
- `created_at`, `updated_at`

### 2.9 Settings
- `user_id`
- `ocr_enabled`（全局）
- `match_rules_json`（日期窗口、金额容差、类别规则）
- `export_template_json`
- `updated_at`

### 2.10 Upload_Session（可选）
- `upload_id`, `receipt_id`, `user_id`
- `signed_url`, `expire_at`
- `status`：`created | completed | failed`

---

## 3. 核心流程（后端视角）

### 3.1 票据上传与入库
1. 前端创建 Receipt（`POST /receipts`），返回 `receipt_id`。
2. 后端生成签名上传 URL（`POST /receipts/{id}/upload-url`）。
3. 前端直传对象存储，回传 `file_url, hash, size` 完成入库。
4. 后端写入 `receipt.upload_status=uploaded`；若 OCR 开启，创建 OCR 任务并置 `ocr_status=pending`。
5. 去重检测：基于 `hash` 找同项目相同 hash，仅提示不阻断。

**注意**
- 上传完成回调必须带 `client_request_id`，避免重复创建。
- 上传失败可重试，Receipt 保留 `upload_status=failed`。

### 3.2 OCR 任务与字段回填
- Worker 拉取 `ocr_status=pending` 的 Receipt。
- OCR 结果写入 `ocr_amount/ocr_date/merchant_keyword`，状态置 `ready`。
- OCR 失败或超时：`ocr_status=failed`，前端允许手动填字段。
- 用户编辑 OCR 字段后，触发候选匹配刷新。

### 3.3 候选匹配刷新
**触发时机**
- 票据上传完成或 OCR 字段更新。
- 支出金额/日期/类别变更。

**计算规则（与 PRD 一致）**
- 同项目；日期 ±3 天（默认）；金额相等（默认容差 0/0.01）；类别一致优先。
- 输出 Top 3 + 置信度（高/中/低）。

**存储策略**
- 可实时计算返回；或写入 `suggestions_json` 供前端快速拉取。

### 3.4 匹配与解除
- 匹配时使用事务：
  1) 校验 `receipt.matched_expense_id` 是否为空或为同一支出。
  2) 写入 `receipt.matched_expense_id = expense_id`。
  3) 写入 `expense_receipt` 关联。
  4) 同步更新 `expense.status`（除非 `manual_status=true`）。
- 解除匹配：删除关联、清空 `matched_expense_id`，重新计算 `expense.status`。

### 3.5 批次检查
- 输入：`filter_json`（日期范围、状态、类别）。
- 输出：缺票、重复、金额不一致、OCR 缺字段（可选）。
- 结果可落库至 `Batch_Issue`，也可实时计算。

### 3.6 导出生成
- 创建导出任务（CSV/ZIP/PDF）后进入 `Export_Record`，交由 Worker 生成。
- CSV 规则、ZIP 命名、PDF 索引页结构遵循 `techdesign.md`。
- 生成完成写回 `file_url`，前端通过签名下载。

---

## 4. API 设计（v1，示例）

> 路径示例以 `/api/v1` 为前缀，返回 JSON。列表接口建议游标分页。

### 4.1 鉴权与用户
- `POST /auth/start`：发送验证码/魔法链接
- `POST /auth/verify`：登录换取 token
- `POST /auth/logout`
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

### 4.5 批次与检查
- `GET /projects/{project_id}/batches`
- `POST /projects/{project_id}/batches`
- `GET /batches/{batch_id}`
- `POST /batches/{batch_id}/check`（重新检查）

### 4.6 导出
- `POST /batches/{batch_id}/exports`（type: csv|zip|pdf）
- `GET /exports/{export_id}`

### 4.7 设置
- `GET /settings`
- `PATCH /settings`

---

## 5. 安全与权限

**鉴权**
- 使用短期 access token + refresh token 或服务端 session。
- Token 绑定 `user_id`，所有资源按 `user_id` 校验。

**文件访问**
- 票据与导出文件均走签名 URL，设置短时有效期。
- 下载行为记入访问日志（可选）。

**删除策略**
- 软删除（`deleted_at`），默认 7 天可恢复。
- 票据删除需二次确认，批次导出保留历史记录。

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

- `RECEIPT_ALREADY_MATCHED`
- `EXPENSE_NOT_FOUND`
- `PROJECT_ARCHIVED`
- `UPLOAD_NOT_COMPLETE`
- `OCR_DISABLED`
- `EXPORT_IN_PROGRESS`
- `BATCH_FILTER_INVALID`

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

