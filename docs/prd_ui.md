# UI/UX 设计说明（移动端优先）

本文件为 UI/UX 与视觉规范，核心需求与验收标准见 `docs/prd_core.md`。

## 10. IA 与导航

**底部 Tab（3 个）**

1. 项目（Projects）
2. 收纳箱（Inbox）——默认显示“当前项目收纳箱”；可切“跨项目”作为后续增强
3. 设置（Settings）

**启动默认路径**：打开 App → 进入上次项目详情 → 默认 Tab=支出。

---

## 11. 交互基线（高频效率原则）

- 默认项目自动选中（上次项目）
- 快速录入固定在底部（类似聊天输入）
- 支出详情用抽屉（避免跳页）
- 匹配在票据卡片就完成（不进多层）
- 可选字段折叠（类别/标签/OCR 编辑等）

---

# 11.1 UI 原型索引

- Project List Screen 1：`ui_prototype/project_list_screen_1/code.html`，`ui_prototype/project_list_screen_1/screen.png`
- Project List Screen 2：`ui_prototype/project_list_screen_2/code.html`，`ui_prototype/project_list_screen_2/screen.png`
- Project Details Expenses Tab：`ui_prototype/project_details:_expenses_tab/code.html`，`ui_prototype/project_details:_expenses_tab/screen.png`
- Project Details Receipts Inbox Tab：`ui_prototype/project_details:_receipts_inbox_tab/code.html`，`ui_prototype/project_details:_receipts_inbox_tab/screen.png`
- 项目详情 批次 Tab：`ui_prototype/项目详情:_批次_tab/code.html`，`ui_prototype/项目详情:_批次_tab/screen.png`
- Batch & Export Screen 1：`ui_prototype/batch_&_export_screen_1/code.html`，`ui_prototype/batch_&_export_screen_1/screen.png`
- Batch & Export Screen 2：`ui_prototype/batch_&_export_screen_2/code.html`，`ui_prototype/batch_&_export_screen_2/screen.png`
- Batch & Export Screen 3：`ui_prototype/batch_&_export_screen_3/code.html`，`ui_prototype/batch_&_export_screen_3/screen.png`

---

# 逐屏组件清单 + 交互状态表（Screen 0–9）

> 统一状态命名（供前端/设计共用）：
> `EMPTY / LOADING / ERROR / UPLOADING / UPLOAD_FAILED / OCR_PENDING / OCR_PROCESSING / OCR_FAILED / SUGGESTIONS_AVAILABLE / MATCHING / MATCH_FAILED / MATCHED / EXPORTING / EXPORT_FAILED`

---

## Screen 0：启动/鉴权（如需要）

**组件**：Splash（可选）、登录页（按实现）、全屏加载指示器
**状态**

- LOADING：`正在加载…`
- ERROR（登录失效）：`登录已过期，请重新登录` + `重新登录`
- ERROR（网络失败）：`网络不稳定，稍后再试` + `重试`

---

## Screen 1：项目列表（Projects）

**结构**：Top App Bar + 搜索 + 置顶区 + 最近区 + 归档入口（可选）
**组件**

- 标题：`项目`；右侧主按钮：`新建`
- 搜索框 placeholder：`搜索项目名/项目号`
- Project Card：项目名、项目号/最近更新、`缺票 N`、`未导出 N`
- Card 菜单（⋯）：`置顶/取消置顶`、`归档/取消归档`

**状态**

- EMPTY：`还没有项目` + `创建第一个项目`
- LOADING：卡片 skeleton 3–6
- ERROR：Banner `加载失败` + `重试`
- 搜索无结果：`没有找到匹配的项目` + `新建项目`

---

## Screen 2：新建/编辑项目（Project Create/Edit）

**组件**

- 字段：`项目名`（或 `项目号` 二选一必填）
- 可选：`标签（可选）`（chips 输入：艺人/城市/阶段）
- Toggle：`置顶项目`
- 主按钮：`保存`

**状态**

- 校验失败：`请至少填写项目名或项目号`
- 保存中：`保存中…`
- 保存失败 Toast：`保存失败，请重试`

---

## Screen 3：项目详情—支出 Tab（Expenses）

**结构**：Top App Bar（项目切换+批次入口）+ Tabs + 筛选条 + 列表 + 底部快速录入条
**组件**

- 右上入口：`批次`
- Tabs：`支出 / 票据 / 批次`
- 筛选 Chips：`全部 缺票 已关联 不需票` + 类别 Chips
- Expense Row：日期、备注、类别（可选）、金额、状态点
- Bottom Composer：金额输入、备注输入、更多、`保存`

**状态**

- EMPTY：`还没有支出记录`（高亮提示底部录入）
- LOADING：列表 skeleton 6–10
- ERROR：`加载失败` + `重试`
- 保存中：按钮 loading；防重复提交
- 保存失败 Toast：`保存失败，请重试`（内容保留）
- 筛选无结果：`当前筛选条件下没有记录` + `清除筛选`

**更多面板（Bottom Sheet）**

- 标题：`更多信息`
- 日期：`今天 / 昨天 / 选择日期`
- 类别：Chips
- 附件：`添加票据`

---

## Screen 4：支出详情抽屉（Expense Detail Drawer）

**组件**

- Header：金额 + 状态 Chip
- 字段：日期、类别、备注、状态
- 附件区：缩略图网格（2 列）+ `添加票据`
- 建议票据：Top 3 + 置信度 + `确认绑定`
- 操作：`从收纳箱选择`、`解除绑定`（仅已绑定）

**状态**

- 无建议：`暂无匹配建议`
- MATCHING：`确认绑定` loading
- MATCH_FAILED：Toast `绑定失败，请重试`
- MATCHED：状态变“已关联”
- 解除绑定：二次确认 `确定解除关联？`

---

## Screen 5：项目详情—票据 Tab（Receipts Inbox）

**组件**

- 顶部：`上传票据`（主按钮）+ OCR 状态
- Receipt Card：缩略图、OCR 字段（可编辑）、重复提示、候选匹配 Top3
- 全屏预览：缩放/左右切换
- 手动匹配选择器：搜索（备注/金额）+ 快捷排序（缺票优先/日期最近/金额相同）

**状态**

- EMPTY：`还没有票据` + `上传票据`
- UPLOADING：显示进度（单卡/全局）
- UPLOAD_FAILED：卡片 `上传失败` + `重试`
- OCR_PROCESSING：`识别中…` + 字段 skeleton
- OCR_FAILED：`未识别到金额/日期，可手动填写`
- SUGGESTIONS_AVAILABLE：展示 Top 3 + `确认匹配`
- MATCHED：`已关联到：{支出摘要}` + `更换匹配 / 解除匹配`
- 重复提示：Banner `疑似重复票据` + `查看对比`（对比页/弹层）

**按钮文案**
`上传票据 / 确认匹配 / 手动匹配 / 忽略建议 / 查看对比 / 更换匹配 / 解除匹配`

---

## Screen 6：批次列表（Batches）

**组件**：标题 `批次` + `新建批次`；批次卡片（范围/条目数/导出时间/状态）
**状态**

- EMPTY：`还没有批次` + `新建批次`
- LOADING：skeleton
- ERROR：`加载失败` + `重试`

---

## Screen 7：新建批次（Create Batch）

**组件**

- 日期范围（默认：上次导出后 → 今天）
- 包含状态：默认勾选`已关联`；可选`缺票`（警告）；`不需票`
- 可选：类别过滤
- CTA：`生成检查`

**状态**

- EXPORTING/生成中：`生成中…`
- 失败：Toast `生成失败，请重试`
  **警告文案**
  `包含缺票记录可能导致报销退回`

---

## Screen 8：批次详情（Batch Detail）

**组件**

- Summary Card：范围、条目数、缺票数、重复数、不一致数
- Issue Accordion：`缺票 / 疑似重复 / 金额不一致`
- 导出按钮：`导出清单（CSV）`、`导出票据（ZIP）`、`导出汇总（PDF）`（可选）

**状态**

- LOADING（检查中）：`正在检查…` + skeleton
- 无问题：`未发现问题，可以导出`
- 有问题：顶部提示 `建议先处理问题再导出`（仍可导出，但按钮旁显示警告）
- EXPORTING：按钮 loading
- EXPORT_FAILED：Toast `导出失败，请重试`

---

## Screen 9：设置（Settings）

**组件**

- OCR 全局开关 + 说明：`用于预填金额/日期并辅助去重，可能不准确，可随时编辑`
- 匹配策略：日期窗口（±3 天）、金额容差（0/0.01/1）、类别规则开关
- 类别管理（可选）
- 导出模板：字段勾选、排序、是否导出 PDF、命名规则展示

---

# 线框布局规格（移动端 PWA）

## 12. 基础栅格与间距

- 基准宽：375（适配 320–430）
- 页面边距：16
- 基线栅格：4pt
- 常用间距：8 / 12 / 16 / 24

## 13. 字体层级与信息优先级

- H1：20–22 SemiBold
- H2：16–18 SemiBold
- Body：15–16 Regular
- Meta：12–13 Regular
- Caption：11–12 Regular

**优先级**：金额/状态/项目名 > 事项备注 > 日期/类别/OCR

## 14. 组件尺寸建议

- Top App Bar：44
- Tab Bar：44
- Bottom Tab Bar：50–56
- Project Card：72–84
- Expense Row：64–72
- Receipt Card：120–160（含候选更高）
- 输入框：44
- Chip：28–32
- 主按钮：44–48（圆角 10–12）
- 点击热区：≥ 44×44

## 15. 列表结构（线框可直接画）

**Project Card**：左文右 badge；padding 12–16
**Expense Row**：左日期 56；右金额 88–104；中备注两行截断；状态点 8–10
**Receipt Card**：上缩略图 72–88；中 OCR 字段；下候选列表每条 44；CTA 在候选条右侧或卡片底部

## 16. 快速录入条（Bottom Composer）

- 固定高度：72–88（含安全区）
- 布局：金额（96–120）+ 备注（自适应）+ 更多（44）+ 保存（72–88）
- 更多面板：`更多信息` → 日期、类别 chips、`添加票据`

## 17. 弹层规范

- 支出详情抽屉：高度 70–90% 可滚动
- 手动匹配：全屏 Modal（搜索更顺）
- 删除/解除：系统 Modal 二次确认

---

# 视觉风格规范（中性企业工具风 + 轻量卡片）

## 18. 设计关键词

中性、克制、信息密度高；状态清晰；票据内容优先；轻动效增强顺滑。

## 19. 颜色 Tokens（建议）

- Neutral：Bg/0 #FFFFFF；Bg/1 #F7F8FA；Border #E6E8EC
- Text：Primary #111827；Secondary #6B7280；Tertiary #9CA3AF
- Primary：#2563EB（主操作）
- Semantic：Success #16A34A；Warning #D97706；Danger #DC2626；Info #0EA5E9

**规则**：列表不整行上色；用状态点+短标签；Warning/Danger 仅局部提示条。

## 20. 字体、圆角、阴影、动效

- 系统字体；卡片圆角 12；按钮 10–12；输入 10；chips 胶囊
- 优先 1px 边框分隔，少量轻阴影用于浮层
- 动效：列表淡入 120ms；Bottom Sheet 220ms；Toast 180ms

---

# 文案与提示策略（防误操作）

- OCR 字段旁提示：`可编辑`、`可能不准确`（弱提示）
- 确认匹配弹窗展示对比：票据日期/金额 vs 支出日期/金额（差异高亮）
- 重复提示不阻断，但在批次检查必须再次出现
- 关键 Toast：`已保存 / 上传失败，请重试 / 已关联 / 导出失败，请重试`

---

# 风格落地避免跑偏（约束）

1. 不做记账式图表与仪表盘
2. 不让颜色承载全部信息（必须有文案/图标）
3. OCR 字段默认不抢空间（可编辑但克制）
4. 候选匹配必须人工确认，确认前必须对比信息展示

---

- docs/techdesign.md
