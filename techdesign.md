
A) 三个核心组件状态机（Receipt Card、Expense Drawer、Batch Issues）：**状态流转图（文字版）+ 触发条件 + UI 表现 + 数据读写**
B) 导出模板与命名规则细则：**CSV 默认字段集/排序/编码、附件打包策略、多附件处理、PDF 索引页结构与编号规则**
C) 后端方案（Backend Plan）：**架构、数据模型、核心流程、API、队列与安全策略（见 backend_plan.md）**

---

# A) 三个核心组件状态机

## A1. Receipt Card 状态机（票据卡片：上传→OCR→建议→匹配→已匹配/解除）

### 1) 状态定义（单卡级）

* `INIT`：卡片占位（刚创建本地对象）
* `UPLOADING`：文件上传中
* `UPLOAD_FAILED`：上传失败（可重试）
* `OCR_PENDING`：已上传，等待 OCR 任务排队（OCR 开启时）
* `OCR_PROCESSING`：OCR 识别中
* `OCR_FAILED`：OCR 失败或无结果（可手填）
* `OCR_READY`：OCR 有结果（可能部分字段为空）
* `SUGGESTING`：计算候选匹配中（或候选刷新中）
* `SUGGESTIONS_AVAILABLE`：候选 Top3 可展示
* `MATCHING`：用户确认匹配提交中
* `MATCH_FAILED`：匹配失败（可重试）
* `MATCHED`：已匹配到某支出
* `UNMATCHING`：解除匹配提交中
* `DELETED`：已删除（不可见）

> 注：若 OCR 全局/项目开关关闭：跳过 OCR_*，直接进入 `SUGGESTING`（或候选为空则停在无建议态）。

---

### 2) 状态流转图（文字版）

```
INIT
  └─(用户上传/导入文件)→ UPLOADING
UPLOADING
  ├─(上传成功)→ [OCR开?] OCR_PENDING : SUGGESTING
  └─(上传失败)→ UPLOAD_FAILED
UPLOAD_FAILED
  ├─(点重试)→ UPLOADING
  └─(删除)→ DELETED

OCR_PENDING
  └─(OCR任务开始)→ OCR_PROCESSING
OCR_PROCESSING
  ├─(OCR成功)→ OCR_READY
  └─(OCR失败/超时)→ OCR_FAILED
OCR_FAILED
  ├─(用户手填金额/日期/商户 任一)→ SUGGESTING
  ├─(重新识别)→ OCR_PROCESSING   [可选按钮]
  └─(跳过识别)→ SUGGESTING       [直接进入候选]
OCR_READY
  └─(保存OCR字段/或用户编辑字段)→ SUGGESTING

SUGGESTING
  ├─(候选计算完成且有Top3)→ SUGGESTIONS_AVAILABLE
  └─(无候选)→ OCR_READY / OCR_FAILED / “NO_SUGGESTIONS”子态（见下）

SUGGESTIONS_AVAILABLE
  ├─(点确认匹配)→ MATCHING
  ├─(手动匹配选择支出)→ MATCHING
  └─(忽略建议)→ “NO_SUGGESTIONS”子态（仅隐藏建议，不影响未来刷新）

MATCHING
  ├─(匹配成功)→ MATCHED
  └─(匹配失败)→ MATCH_FAILED
MATCH_FAILED
  ├─(重试)→ MATCHING
  └─(取消)→ SUGGESTIONS_AVAILABLE 或 OCR_READY

MATCHED
  ├─(更换匹配)→ MATCHING（先解除再绑定，或直接换绑）
  └─(解除匹配)→ UNMATCHING
UNMATCHING
  ├─(解除成功)→ SUGGESTING
  └─(解除失败)→ MATCHED（Toast提示失败）
```

**“NO_SUGGESTIONS”子态（UI 表现态，不一定需要后端状态）**

* 展示：`暂无匹配建议` + `手动匹配`
* 触发：候选为空 / 用户忽略建议 / OCR 未提供金额日期导致无法建议
* 退出：用户编辑 OCR 字段、修改项目、或新增支出导致候选刷新

---

### 3) 触发条件（Events）

| 事件                                               | 触发源  | 前置条件       | 结果                                                |
| ------------------------------------------------ | ---- | ---------- | ------------------------------------------------- |
| `upload_start(file)`                             | 用户   | -          | INIT→UPLOADING                                    |
| `upload_success(receipt_id, file_url, hash)`     | 后端   | -          | UPLOADING→OCR_PENDING 或 SUGGESTING                |
| `upload_fail(error)`                             | 后端   | -          | UPLOADING→UPLOAD_FAILED                           |
| `ocr_start(job_id)`                              | 后端   | OCR开启      | OCR_PENDING→OCR_PROCESSING                        |
| `ocr_success(ocr_amount?, ocr_date?, merchant?)` | 后端   | -          | OCR_PROCESSING→OCR_READY                          |
| `ocr_fail`                                       | 后端   | -          | OCR_PROCESSING→OCR_FAILED                         |
| `edit_ocr_fields(...)`                           | 用户   | -          | OCR_READY/OCR_FAILED→SUGGESTING                   |
| `suggest_done(list)`                             | 前/后端 | -          | SUGGESTING→SUGGESTIONS_AVAILABLE 或 NO_SUGGESTIONS |
| `confirm_match(expense_id)`                      | 用户   | receipt已上传 | →MATCHING                                         |
| `match_success(expense_id)`                      | 后端   | 业务校验通过     | MATCHING→MATCHED                                  |
| `match_fail`                                     | 后端   | -          | MATCHING→MATCH_FAILED                             |
| `unmatch`                                        | 用户   | 已匹配        | MATCHED→UNMATCHING                                |

---

### 4) UI 表现映射（关键）

* `UPLOADING`：卡片骨架 + 进度条；禁用匹配按钮
* `OCR_PROCESSING`：显示 `识别中…` + OCR 字段 skeleton
* `OCR_FAILED`：提示 `未识别到金额/日期，可手动填写` + 可编辑字段
* `SUGGESTIONS_AVAILABLE`：显示 Top 3 + 置信度 + `确认匹配`
* `MATCHING`：`确认匹配`按钮 loading；防重复点击
* `MATCHED`：卡片顶部显示 `已匹配到：{支出摘要}`；按钮变 `更换匹配 / 解除匹配`

---

### 5) 数据读写约束（后端校验要点）

* 匹配写入：`receipt.matched_expense_id = expense_id`，同时 `expense.receipt_ids += receipt_id`
* 默认不允许一票多用：若 `receipt.matched_expense_id != null` 且不是“更换”，拒绝并返回错误码 `RECEIPT_ALREADY_MATCHED`
* 更换匹配：建议后端提供 `PATCH /receipts/{id}/match` 支持 replace（原子性：解除旧绑定 + 绑定新支出）
* 去重：基于 `hash`，仅提示不拦截；在批次检查中列为风险项

---

## A2. Expense Drawer 状态机（支出详情抽屉：查看→编辑→匹配→状态同步）

### 1) 状态定义（抽屉级）

* `CLOSED`
* `OPEN_VIEW`：只读/轻编辑态（默认打开）
* `EDITING`：字段编辑中（日期/金额/类别/备注/状态）
* `SAVING`：保存中
* `SAVE_FAILED`
* `ATTACHING`：添加票据中（从收纳箱选择/上传新票据）
* `MATCHING`：绑定票据中（确认绑定）
* `MATCHED`：绑定成功后的稳定态（可与 OPEN_VIEW 合并，用数据驱动展示）
* `UNMATCHING`：解除绑定中
* `DIRTY_CONFIRM`：关闭前确认（有未保存修改）

---

### 2) 状态流转图（文字版）

```
CLOSED
  └─(点支出行)→ OPEN_VIEW
OPEN_VIEW
  ├─(编辑任一字段)→ EDITING
  ├─(点添加票据)→ ATTACHING
  ├─(点建议票据确认绑定)→ MATCHING
  ├─(点从收纳箱选择)→ ATTACHING
  └─(关闭抽屉)→ CLOSED

EDITING
  ├─(保存)→ SAVING
  ├─(取消)→ OPEN_VIEW（丢弃）
  └─(关闭抽屉)→ DIRTY_CONFIRM

SAVING
  ├─(保存成功)→ OPEN_VIEW（数据更新）
  └─(保存失败)→ SAVE_FAILED
SAVE_FAILED
  ├─(重试)→ SAVING
  └─(取消)→ EDITING

ATTACHING
  ├─(选择票据并确认绑定)→ MATCHING
  ├─(上传新票据完成并确认绑定)→ MATCHING
  └─(取消)→ OPEN_VIEW

MATCHING
  ├─(绑定成功)→ OPEN_VIEW（状态变已匹配）
  └─(绑定失败)→ OPEN_VIEW + Toast（或进入局部错误态）

OPEN_VIEW(已匹配)
  └─(解除绑定)→ UNMATCHING
UNMATCHING
  ├─(解除成功)→ OPEN_VIEW（若无票据→缺票）
  └─(解除失败)→ OPEN_VIEW + Toast

DIRTY_CONFIRM
  ├─(放弃修改并关闭)→ CLOSED
  └─(继续编辑)→ EDITING
```

---

### 3) 触发条件与联动

**联动 1：支出状态自动计算**

* 若 `expense.status` 未手动设为 `no_receipt_required`：

  * `receipt_ids.length > 0` → `matched`
  * `receipt_ids.length == 0` → `missing_receipt`

**联动 2：匹配成功后的 UI 更新**

* 抽屉内：附件区立刻出现票据缩略图；状态 chip 变 `已匹配`
* 列表行：状态点从红变绿（同一数据源刷新）

**联动 3：金额/日期变更影响候选建议**

* 用户修改 `amount/date/category` 后，候选建议需要刷新（前端触发重新请求或本地计算）

---

### 4) UI 关键点（避免误操作）

* 关闭抽屉：若有未保存字段变化，必须弹 `放弃修改？`
* 解除绑定：必须二次确认 `确定解除该票据与此支出的关联？`
* 匹配确认弹窗：显示票据 vs 支出金额/日期对比，有差异时黄色提示

---

## A3. Batch Issues 状态机（批次问题清单：生成→检查→修复→再检查→导出）

### 1) 状态定义（批次详情页级）

* `INIT`：刚进入批次详情
* `CHECKING`：运行检查
* `CHECK_READY`：检查结果可展示

  * `NO_ISSUES`（子态）
  * `HAS_ISSUES`（子态）
* `RESOLVING`：用户跳转修复中（页面仍保持结果，但需标记“结果可能过期”）
* `RECHECKING`：返回后重新检查
* `EXPORTING_CSV` / `EXPORTING_ZIP` / `EXPORTING_PDF`
* `EXPORT_FAILED`

---

### 2) 状态流转图（文字版）

```
INIT
  └─(进入批次详情)→ CHECKING
CHECKING
  ├─(检查完成无问题)→ CHECK_READY.NO_ISSUES
  └─(检查完成有问题)→ CHECK_READY.HAS_ISSUES

CHECK_READY.HAS_ISSUES
  ├─(点某问题项→跳转支出/票据)→ RESOLVING
  ├─(仍导出)→ EXPORTING_*
  └─(刷新检查)→ RECHECKING

RESOLVING
  └─(返回批次详情)→ RECHECKING
RECHECKING
  └─(检查完成)→ CHECK_READY.(NO_ISSUES/HAS_ISSUES)

CHECK_READY.NO_ISSUES
  └─(导出)→ EXPORTING_*

EXPORTING_*
  ├─(成功)→ CHECK_READY（保持）+ Toast“已生成导出文件”
  └─(失败)→ EXPORT_FAILED
EXPORT_FAILED
  ├─(重试)→ EXPORTING_*
  └─(取消)→ CHECK_READY
```

---

### 3) 问题类型与触发条件（检查规则）

**Issue Types（默认必须）**

1. `MISSING_RECEIPT`（缺票支出）

   * 条件：`expense.status == missing_receipt` 且在批次筛选范围内
2. `DUPLICATE_RECEIPT_HASH`（重复票据）

   * 条件：批次涉及的 receipt 中存在相同 `hash`（跨支出/或同支出多个附件也算）
3. `AMOUNT_MISMATCH`（金额不一致）

   * 条件：receipt 有 `ocr_amount` 或手填 `receipt_amount` 且 `abs(receipt_amount - expense.amount) > tolerance`
   * tolerance 默认 0 或 0.01（与匹配策略一致）
4. （可选）`OCR_MISSING_KEY_FIELDS`（OCR 未识别关键字段）

   * 条件：OCR 开启且 `ocr_amount`、`ocr_date` 均为空（仅提示，不算阻断）

**Issue Severity**

* 缺票：`high`
* 重复：`medium`
* 金额不一致：`medium`
* OCR 缺字段：`low`

---

### 4) 导出阻断策略（建议默认：不阻断，但强提示）

* `HAS_ISSUES` 时允许导出，但导出按钮显示警告图标 + 顶部提示 `建议先处理问题再导出`
* 可在设置里提供“严格模式”开关：缺票/重复时阻断 ZIP 导出（后续）

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
7. `状态`（缺票/已匹配/不需票）
8. `票据数量`（receipt_ids.length）
9. `票据文件名列表`（导出命名后的文件名，用 `;` 分隔）
10. `票据OCR金额`（可选：若有多个票据，用 `;` 分隔；默认可关闭）
11. `票据OCR日期`（可选，同上）
12. `商户关键字`（可选，同上）
13. `支出ID`（内部追溯，可选默认关闭）
14. `票据ID列表`（内部追溯，可选默认关闭）

> 默认建议开启到第 9 列即可；10–14 属于“排查/对账”增强列，可在设置中启用。

### 2) CSV 编码与格式

* 编码：**UTF-8 with BOM**（兼容 Excel 打开中文不乱码）
* 分隔符：`,`（逗号）
* 换行：`\r\n`
* 金额：两位小数（例如 1000.00）
* 日期：统一 `YYYY-MM-DD`
* 文本字段：包含逗号/引号/换行时按 RFC4180 加双引号转义

### 3) CSV 行排序（默认）

* 先按：`日期 asc`
* 再按：`序号 asc`（稳定）
* 或者按你习惯：`日期 desc`（可在导出设置里选择）

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

* `序号`：3 位补零 `001`
* `日期`：`YYYY-MM-DD`
* `金额`：两位小数
* `类别`：取枚举中文（交通/餐饮…）；空则 `其他`
* `备注前20字`：

  * 仅保留中文/英文/数字/空格，其他符号替换为 `_`
  * 过长截断；空则 `-`
* `票据ID短码`：receipt_id 的后 4–6 位或 hash 前 6 位
* 扩展名：保留原始文件 ext

**文件名长度控制**

* 建议最长 120 字符；超出时进一步截断备注

### 3) 一笔支出多附件（0..n）策略

**默认允许一笔支出绑定多票据**（例如餐饮分开发票、交通多段行程）。
此时**一个序号对应多个文件**，处理方式：

* CSV：同一序号行中 `票据数量 > 1`，`票据文件名列表` 用 `;` 分隔
* ZIP：文件名加“子序号”后缀，保证唯一：

  * `001a_...jpg`, `001b_...png`, `001c_...pdf`
  * 子序号：a,b,c…（超过 26 用 aa/ab）

**一张票据只允许匹配一个支出**（避免一票多用）。

### 4) 票据未匹配但要导出（是否包含）

* 默认：ZIP 只导出“批次筛选范围内的支出所绑定票据”
* 可选开关：`包含未匹配票据（收纳箱）`（默认关闭）

  * 主要用于“先打包再手动上传”的人群，但容易混乱

---

## B3. PDF 汇总索引页（Index PDF）结构

### 1) PDF 目的

* 给你在公司系统上传/核对时提供“序号 ↔ 支出 ↔ 票据文件名”对照
* 当 ZIP 内附件较多时，PDF 是最省脑的导航页

### 2) PDF 内容结构（建议 3 段）

**封面/摘要（第一页上半）**

* 批次名称
* 项目
* 日期范围
* 导出时间
* 条目数、缺票数、重复数、不一致数（如果导出时仍有问题）

**条目索引表（核心，多页）**
表头（固定）：

* 序号
* 日期
* 金额
* 类别
* 事项备注（截断 20–30 字）
* 票据文件名（可多行，最多显示 2 行；超出用 “+N”）

**问题清单（可选附录）**

* 若导出时存在问题：附上“缺票/重复/不一致”列表（只列序号与摘要，便于回查）

### 3) 编号与分页规则

* 每条支出序号固定，不因票据数量变化而变
* 表格每页建议 12–18 行（视字体大小）
* 票据文件名过长：换行 + 截断，保留后缀与短码

---

## B4. 导出选项（设置项建议）

* `CSV 字段模板`：勾选列、列顺序拖拽（后续）
* `排序`：日期升序/降序
* `ZIP 结构`：是否按类别分文件夹（默认不分）
* `PDF`：是否生成索引页（默认开启）
* `严格模式（后续）`：存在缺票/重复是否阻断导出

---

# 交付给开发/测试的“关键用例清单”（用于验证状态机 + 导出）

1. 票据上传失败→重试→成功→OCR→候选→确认匹配
2. OCR 失败→手填金额/日期→候选出现→匹配
3. 已匹配票据→更换匹配→原子换绑成功
4. 一笔支出绑定 2 张票据→ZIP 文件名 `001a/001b` → CSV 文件名列表一致
5. 批次存在缺票/重复/不一致→检查清单正确→仍可导出→PDF 附录列出问题
6. CSV 用 Excel 打开不乱码（UTF-8 BOM）
7. 附件命名在 Windows/macOS 解压均合法（非法字符替换）
