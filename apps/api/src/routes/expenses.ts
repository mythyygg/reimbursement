/**
 * 费用管理路由模块
 *
 * 【Java 对比 - 类似 Spring MVC Controller + Service】
 *
 * 本文件等同于 Spring 的 REST 控制器：
 * ```java
 * @RestController
 * @RequestMapping("/api/v1")
 * @PreAuthorize("isAuthenticated()")
 * public class ExpenseController {
 *     @Autowired
 *     private ExpenseService expenseService;
 *
 *     @Autowired
 *     private ReceiptMatchingService matchingService;
 *
 *     @GetMapping("/projects/{projectId}/expenses")
 *     public ResponseEntity<?> getExpenses(
 *         @PathVariable String projectId,
 *         @RequestParam(required = false) String status
 *     ) { ... }
 *
 *     @PostMapping("/projects/{projectId}/expenses")
 *     public ResponseEntity<?> createExpense(
 *         @PathVariable String projectId,
 *         @RequestBody ExpenseDto dto
 *     ) { ... }
 * }
 * ```
 *
 * 【核心功能】
 * 1. 费用管理：
 *    - 创建费用记录
 *    - 查询费用列表（支持多维度过滤）
 *    - 更新费用信息
 *    - 删除费用（级联处理关联票据）
 *
 * 2. 票据关联：
 *    - 查询费用的已关联票据
 *    - 智能推荐可匹配票据（基于金额、日期、类别）
 *
 * 3. 状态管理：
 *    - pending: 待处理（刚创建）
 *    - processing: 处理中（已关联票据）
 *    - completed: 已完成（用户手动标记）
 *    - manualStatus: 标记是否为用户手动设置状态
 *
 * 【智能匹配机制】
 * - 基于规则的匹配：金额差异、日期窗口、类别匹配
 * - 置信度评分：high/medium/low
 * - 用户可配置规则（在settings表）
 *
 * 【幂等性设计】
 * - client_request_id: 防止重复创建
 * - 相同请求ID返回已存在记录
 *
 * 【级联处理】
 * - 删除费用时自动清理关联票据的匹配关系
 * - 使用事务确保数据一致性
 */

import { Hono } from "hono";
import { z } from "zod"; // Zod 验证库
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm"; // Drizzle ORM 查询构建器
import {
  expenseReceipts,
  expenses,
  receipts,
  settings,
} from "../db/index.js";
import { daysBetween, parseDate } from "../utils/index.js";
import { db } from "../db/client.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

/**
 * TypeScript 类型定义
 *
 * 【$inferSelect】Drizzle 自动推断的类型
 * - 从表定义自动生成查询结果的类型
 * - 类似 JPA Entity 的类型
 */
type ReceiptRow = typeof receipts.$inferSelect;

/**
 * 票据候选匹配结果
 *
 * 【Java 对比】类似：
 * ```java
 * public class ReceiptCandidate {
 *     private String receiptId;
 *     private String confidence;  // "high" | "medium" | "low"
 *     private String reason;
 *     private int score;
 * }
 * ```
 */
type ReceiptCandidate = {
  receiptId: string;
  confidence: string;
  reason: string;
  score: number;
};

/**
 * 创建费用请求验证规则
 *
 * 【Zod 验证】类似 Java Bean Validation：
 * ```java
 * public class ExpenseCreateDto {
 *     @Positive
 *     private BigDecimal amount;
 *
 *     @NotBlank
 *     private String note;
 *
 *     @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
 *     private Date date;  // 可选
 *
 *     private String category;  // 可选
 *
 *     @Pattern(regexp = "pending|processing|completed")
 *     private String status;  // 可选
 *
 *     private String clientRequestId;  // 可选
 * }
 * ```
 *
 * 【验证规则】
 * - amount: 必填，正数
 * - note: 必填，最少1个字符
 * - date: 可选，ISO 8601格式
 * - category: 可选
 * - status: 可选，枚举值
 * - client_request_id: 可选，幂等性标识
 */
const expenseCreateSchema = z.object({
  amount: z.number().positive(),
  note: z.string().min(1),
  date: z.string().datetime().optional(),
  category: z.string().optional(),
  status: z
    .enum(["pending", "processing", "completed"])
    .optional(),
  client_request_id: z.string().optional(),
});

/**
 * 更新费用请求验证规则
 *
 * 【与创建的区别】
 * - 所有字段都是可选的（PATCH 请求）
 * - category 可以设置为 null（清空类别）
 *
 * 【Java 对比】类似：
 * ```java
 * public class ExpenseUpdateDto {
 *     private Optional<BigDecimal> amount;
 *     private Optional<String> note;
 *     private Optional<Date> date;
 *     @Nullable
 *     private Optional<String> category;  // 可以设置为 null
 *     private Optional<String> status;
 * }
 * ```
 */
const expenseUpdateSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().min(1).optional(),
  date: z.string().datetime().optional(),
  category: z.string().optional().nullable(),
  status: z
    .enum(["pending", "processing", "completed"])
    .optional(),
});

/**
 * GET /api/v1/projects/:projectId/expenses - 获取费用列表
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/projects/{projectId}/expenses")
 * public ResponseEntity<?> getExpenses(
 *     @PathVariable String projectId,
 *     @RequestParam(required = false) String status,
 *     @RequestParam(required = false) String category,
 *     @RequestParam(required = false) String dateFrom,
 *     @RequestParam(required = false) String dateTo,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 构建查询条件
 *     Specification<Expense> spec = Specification.where(
 *         ExpenseSpecs.belongsToUser(userId)
 *             .and(ExpenseSpecs.belongsToProject(projectId))
 *     );
 *
 *     if (status != null) {
 *         spec = spec.and(ExpenseSpecs.statusEquals(status));
 *     }
 *     if (category != null) {
 *         spec = spec.and(ExpenseSpecs.categoryEquals(category));
 *     }
 *     if (dateFrom != null) {
 *         spec = spec.and(ExpenseSpecs.dateGreaterThanOrEqual(dateFrom));
 *     }
 *     if (dateTo != null) {
 *         spec = spec.and(ExpenseSpecs.dateLessThanOrEqual(dateTo));
 *     }
 *
 *     List<Expense> expenses = expenseRepository.findAll(spec,
 *         Sort.by("date").and(Sort.by("createdAt"))
 *     );
 *
 *     return ResponseEntity.ok(expenses);
 * }
 * ```
 *
 * 【查询参数】
 * - status: 按状态筛选（pending/processing/completed）
 * - category: 按类别筛选
 * - date_from: 开始日期（包含）
 * - date_to: 结束日期（包含）
 *
 * 【查询流程】
 * 1. 读取所有查询参数
 * 2. 构建动态过滤条件数组
 * 3. 根据参数添加对应的过滤条件
 * 4. 执行查询并排序（按日期和创建时间）
 * 5. 返回费用列表
 *
 * 【动态过滤】
 * - 基础条件：userId + projectId（必须）
 * - 可选条件：根据查询参数动态添加
 * - 类似 JPA Specification 模式
 *
 * 【排序规则】
 * - 优先按日期排序（date）
 * - 次优先按创建时间排序（createdAt）
 *
 * 【性能优化】
 * - 添加详细的性能日志
 * - 记录查询耗时和结果数量
 */
router.get("/projects/:projectId/expenses", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const status = c.req.query("status");
  const category = c.req.query("category");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");

  // 构建动态过滤条件数组
  // 【类型注解】SQL<unknown>[] - Drizzle SQL 表达式数组
  const filters = [
    eq(expenses.userId, userId),
    eq(expenses.projectId, projectId),
  ];

  // 根据查询参数添加过滤条件
  if (status) {
    filters.push(eq(expenses.status, status));
  }
  if (category) {
    filters.push(eq(expenses.category, category));
  }
  if (dateFrom) {
    // 【gte】Greater Than or Equal - 大于等于
    // SQL: date >= ?
    filters.push(gte(expenses.date, new Date(dateFrom)));
  }
  if (dateTo) {
    // 【lte】Less Than or Equal - 小于等于
    // SQL: date <= ?
    filters.push(lte(expenses.date, new Date(dateTo)));
  }

  // 执行查询
  const t1 = Date.now();
  const data = await db
    .select()
    .from(expenses)
    // 【and】将所有过滤条件用 AND 连接
    .where(and(...filters))
    // 【orderBy】排序：先按日期，再按创建时间
    .orderBy(expenses.date, expenses.createdAt);

  // 查询每条费用的票据数量
  const t2 = Date.now();
  const receiptCounts = await db
    .select({
      expenseId: receipts.matchedExpenseId,
      receiptCount: sql<number>`count(*)`.as("receiptCount"),
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.userId, userId),
        eq(receipts.projectId, projectId),
        isNull(receipts.deletedAt),
        sql`${receipts.matchedExpenseId} is not null`
      )
    )
    .groupBy(receipts.matchedExpenseId);
  console.log(
    `[expenses] [DB] 查询票据数量耗时: ${Date.now() - t2}ms - 返回 ${receiptCounts.length} 条`
  );

  const receiptCountMap = new Map(
    receiptCounts.map((item) => [item.expenseId as string, item.receiptCount])
  );

  const withCounts = data.map((expense) => ({
    ...expense,
    receiptCount: receiptCountMap.get(expense.expenseId) ?? 0,
  }));

  console.log(`[expenses] [DB] 查询费用列表耗时: ${Date.now() - t1}ms - 返回 ${data.length} 条, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, withCounts);
});

/**
 * POST /api/v1/projects/:projectId/expenses - 创建费用
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/projects/{projectId}/expenses")
 * public ResponseEntity<?> createExpense(
 *     @PathVariable String projectId,
 *     @Valid @RequestBody ExpenseCreateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 幂等性检查
 *     if (dto.getClientRequestId() != null) {
 *         Optional<Expense> existing = expenseRepository
 *             .findByUserIdAndProjectIdAndClientRequestId(
 *                 userId, projectId, dto.getClientRequestId()
 *             );
 *         if (existing.isPresent()) {
 *             return ResponseEntity.ok(existing.get());
 *         }
 *     }
 *
 *     // 创建费用
 *     Expense expense = new Expense();
 *     expense.setUserId(userId);
 *     expense.setProjectId(projectId);
 *     expense.setAmount(dto.getAmount());
 *     expense.setNote(dto.getNote());
 *     expense.setDate(dto.getDate() != null ? dto.getDate() : new Date());
 *     expense.setCategory(dto.getCategory());
 *     expense.setStatus(dto.getStatus() != null ? dto.getStatus() : "pending");
 *     expense.setManualStatus("completed".equals(expense.getStatus()));
 *     expense.setClientRequestId(dto.getClientRequestId());
 *
 *     expenseRepository.save(expense);
 *     return ResponseEntity.ok(expense);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 幂等性检查（如果提供了 client_request_id）
 * 3. 处理默认值（日期、状态）
 * 4. 计算 manualStatus 标志
 * 5. 插入费用记录
 * 6. 返回新创建的费用
 *
 * 【幂等性设计】
 * - client_request_id: 客户端生成的唯一ID
 * - 防止网络重试导致重复创建
 * - 如果已存在，直接返回已有记录
 *
 * 【状态管理】
 * - 默认状态：pending（待处理）
 * - manualStatus 标志：
 *   - true: 用户手动设置为 completed
 *   - false: 系统根据票据关联自动管理状态
 *
 * 【manualStatus 的作用】
 * - 当 manualStatus=true 时，系统不会自动修改状态
 * - 当 manualStatus=false 时：
 *   - 关联票据后自动变为 processing
 *   - 取消所有票据后自动变回 pending
 *
 * 【金额存储】
 * - 数据库存储为字符串（避免浮点精度问题）
 * - 前端传入数字，后端转换为字符串
 * - 类似 Java 的 BigDecimal.toString()
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 */
router.post("/projects/:projectId/expenses", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = expenseCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 幂等性检查：查询是否已存在相同 clientRequestId 的费用
  if (body.data.client_request_id) {
    const existing = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.projectId, projectId),
          eq(expenses.clientRequestId, body.data.client_request_id)
        )
      );

    if (existing.length > 0) {
      // 已存在，返回已有记录（幂等）
      return ok(c, existing[0]);
    }
  }

  // 处理默认值
  const now = new Date();
  const date = body.data.date ? new Date(body.data.date) : now;
  const status = body.data.status ?? "pending";

  // 【manualStatus】标记是否为用户手动设置的状态
  // - 如果创建时就设置为 completed，说明是用户手动设置
  // - 系统自动状态管理不会影响 manualStatus=true 的费用
  const manualStatus = status === "completed";

  // 插入费用记录
  const [expense] = await db
    .insert(expenses)
    .values({
      userId,
      projectId,
      amount: String(body.data.amount), // 转为字符串存储
      note: body.data.note,
      date,
      category: body.data.category,
      status,
      manualStatus,
      clientRequestId: body.data.client_request_id,
    })
    .returning();

  return ok(c, expense);
});

/**
 * PATCH /api/v1/expenses/:expenseId - 更新费用信息
 *
 * 【Java 对比】类似：
 * ```java
 * @PatchMapping("/expenses/{expenseId}")
 * public ResponseEntity<?> updateExpense(
 *     @PathVariable String expenseId,
 *     @Valid @RequestBody ExpenseUpdateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Expense expense = expenseRepository.findById(expenseId)
 *         .orElseThrow(() -> new NotFoundException("Expense not found"));
 *
 *     // 验证权限
 *     if (!expense.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     // 只更新提供的字段
 *     if (dto.getAmount() != null) expense.setAmount(dto.getAmount());
 *     if (dto.getNote() != null) expense.setNote(dto.getNote());
 *     if (dto.getDate() != null) expense.setDate(dto.getDate());
 *     if (dto.getCategory() != null) expense.setCategory(dto.getCategory());
 *     if (dto.getStatus() != null) {
 *         expense.setStatus(dto.getStatus());
 *         expense.setManualStatus("completed".equals(dto.getStatus()));
 *     }
 *     expense.setUpdatedAt(new Date());
 *
 *     expenseRepository.save(expense);
 *     return ResponseEntity.ok(expense);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 动态构建更新对象（只包含提供的字段）
 * 3. 如果更新状态，同步更新 manualStatus
 * 4. 执行更新（WHERE 条件包含 userId 验证权限）
 * 5. 返回更新后的费用
 *
 * 【动态更新】
 * - 使用 Record<string, unknown> 类型
 * - 只添加提供的字段（undefined !== 检查）
 * - 类似 Java 的 Map<String, Object>
 *
 * 【状态同步】
 * - 更新状态时，自动同步 manualStatus
 * - 设置为 completed → manualStatus=true
 * - 设置为其他状态 → manualStatus=false
 *
 * 【权限验证】
 * - WHERE 条件包含 userId，确保只能更新自己的费用
 * - 如果费用不存在或不属于当前用户，返回 404
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 404 EXPENSE_NOT_FOUND: 费用不存在或无权限
 */
router.patch("/expenses/:expenseId", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");
  const body = expenseUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 动态构建更新对象
  // 【Record<string, unknown>】类似 Java 的 Map<String, Object>
  const update: Record<string, unknown> = { updatedAt: new Date() };

  // 只添加提供的字段（undefined !== 检查）
  if (body.data.amount !== undefined) {
    update.amount = String(body.data.amount);
  }
  if (body.data.note !== undefined) {
    update.note = body.data.note;
  }
  if (body.data.date !== undefined) {
    update.date = new Date(body.data.date);
  }
  if (body.data.category !== undefined) {
    update.category = body.data.category;
  }
  if (body.data.status !== undefined) {
    update.status = body.data.status;
    // 同步 manualStatus 标志
    update.manualStatus = body.data.status === "completed";
  }

  // 更新费用
  const [expense] = await db
    .update(expenses)
    .set(update)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)))
    .returning();

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  return ok(c, expense);
});

/**
 * DELETE /api/v1/expenses/:expenseId - 删除费用
 *
 * 【Java 对比】类似：
 * ```java
 * @DeleteMapping("/expenses/{expenseId}")
 * @Transactional
 * public ResponseEntity<?> deleteExpense(
 *     @PathVariable String expenseId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Expense expense = expenseRepository.findById(expenseId)
 *         .orElseThrow(() -> new NotFoundException("Expense not found"));
 *
 *     if (!expense.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     // 清除关联票据的匹配关系
 *     receiptRepository.clearMatchedExpenseId(expenseId);
 *
 *     // 删除费用-票据关联记录
 *     expenseReceiptRepository.deleteByExpenseId(expenseId);
 *
 *     // 删除费用
 *     expenseRepository.delete(expense);
 *
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 验证费用存在且属于当前用户
 * 2. 使用事务执行以下操作：
 *    a. 清除所有关联票据的 matchedExpenseId
 *    b. 删除 expenseReceipts 关联记录
 *    c. 删除费用记录
 *
 * 【级联清理】
 * - 删除费用前，必须清理所有关联数据
 * - 关联票据不会被删除，只是取消匹配关系
 * - 类似 SQL: UPDATE receipts SET matched_expense_id = NULL
 *
 * 【事务处理】
 * - db.transaction() - 确保所有操作原子性
 * - 类似 Java @Transactional
 * - 如果中间失败，全部回滚
 *
 * 【物理删除】
 * - 费用使用物理删除（DELETE FROM expenses）
 * - 票据使用软删除（设置 deletedAt）
 * - 不同实体有不同的删除策略
 *
 * 【错误响应】
 * - 404 EXPENSE_NOT_FOUND: 费用不存在或无权限
 */
router.delete("/expenses/:expenseId", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");

  // 验证费用存在且属于当前用户
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  // 【事务】确保所有删除操作原子性
  await db.transaction(async (tx) => {
    // 1. 清除关联票据的 matchedExpenseId
    // 票据不会被删除，只是取消匹配关系
    await tx
      .update(receipts)
      .set({ matchedExpenseId: null, updatedAt: new Date() })
      .where(eq(receipts.matchedExpenseId, expenseId));

    // 2. 删除费用-票据关联记录
    await tx
      .delete(expenseReceipts)
      .where(eq(expenseReceipts.expenseId, expenseId));

    // 3. 删除费用本身
    await tx
      .delete(expenses)
      .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));
  });

  return ok(c, { success: true });
});

/**
 * GET /api/v1/expenses/:expenseId/receipts - 获取费用的关联票据
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/expenses/{expenseId}/receipts")
 * public ResponseEntity<?> getExpenseReceipts(
 *     @PathVariable String expenseId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     List<Receipt> receipts = receiptRepository.findAll(
 *         Specification.where(
 *             ReceiptSpecs.belongsToUser(userId)
 *                 .and(ReceiptSpecs.matchedToExpense(expenseId))
 *         )
 *     );
 *
 *     return ResponseEntity.ok(receipts);
 * }
 * ```
 *
 * 【业务逻辑】
 * - 查询所有 matchedExpenseId = expenseId 的票据
 * - 只返回属于当前用户的票据（权限验证）
 *
 * 【使用场景】
 * - 费用详情页显示关联的票据列表
 * - 查看费用的报销凭证
 */
router.get("/expenses/:expenseId/receipts", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");

  // 查询关联的票据
  const data = await db
    .select()
    .from(receipts)
    .where(
      and(eq(receipts.userId, userId), eq(receipts.matchedExpenseId, expenseId))
    );

  return ok(c, data);
});

/**
 * GET /api/v1/expenses/:expenseId/receipt-candidates - 获取票据匹配候选
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/expenses/{expenseId}/receipt-candidates")
 * public ResponseEntity<?> getReceiptCandidates(
 *     @PathVariable String expenseId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Expense expense = expenseRepository.findById(expenseId)
 *         .orElseThrow(() -> new NotFoundException("Expense not found"));
 *
 *     Settings settings = settingsRepository.findByUserId(userId)
 *         .orElse(new Settings());
 *
 *     MatchRules rules = new MatchRules(
 *         settings.getDateWindowDays(),
 *         settings.getAmountTolerance(),
 *         settings.isRequireCategoryMatch()
 *     );
 *
 *     List<Receipt> receipts = receiptRepository.findByProjectIdAndNotDeleted(
 *         expense.getProjectId()
 *     );
 *
 *     List<ReceiptCandidate> candidates = matchingService.findCandidates(
 *         expense, receipts, rules
 *     );
 *
 *     return ResponseEntity.ok(candidates);
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 查询费用信息
 * 2. 读取用户的匹配规则配置
 * 3. 查询项目下所有未删除的票据
 * 4. 基于规则计算匹配候选
 * 5. 按匹配分数排序，返回前3个
 *
 * 【匹配规则】（可在用户设置中配置）
 * - dateWindowDays: 日期容差（默认3天）
 * - amountTolerance: 金额容差（默认0）
 * - requireCategoryMatch: 是否要求类别匹配（默认false）
 *
 * 【匹配算法】
 * 1. 过滤条件：
 *    - 票据未关联其他费用，或已关联当前费用
 *    - 票据有金额和日期信息
 *    - 金额差异 ≤ amountTolerance
 *
 * 2. 计算置信度：
 *    - high: 日期差 ≤ 1天 且 类别匹配
 *    - medium: 日期差 ≤ 3天
 *    - low: 其他
 *
 * 3. 计算分数：
 *    - 基础分：10 - min(日期差, 10)
 *    - 类别匹配奖励：+2分
 *
 * 4. 排序和截取：
 *    - 按分数降序排序
 *    - 返回前3个候选
 *
 * 【候选票据过滤】
 * - 只考虑未匹配的票据（matchedExpenseId = null）
 * - 或者已匹配当前费用的票据（允许查看已匹配的）
 * - 过滤掉软删除的票据（deletedAt IS NULL）
 *
 * 【响应格式】
 * ```json
 * [
 *   {
 *     "receiptId": "abc-123",
 *     "confidence": "high",
 *     "reason": "date+/-1d + category"
 *   },
 *   {
 *     "receiptId": "def-456",
 *     "confidence": "medium",
 *     "reason": "date+/-2d"
 *   }
 * ]
 * ```
 *
 * 【错误响应】
 * - 404 EXPENSE_NOT_FOUND: 费用不存在或无权限
 */
router.get("/expenses/:expenseId/receipt-candidates", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");

  // 查询费用信息
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  // 读取用户的匹配规则配置
  const [userSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));

  // 【?? 运算符】空值合并，类似 Java Optional.orElse()
  const rules = {
    dateWindowDays: Number(userSettings?.matchRulesJson?.dateWindowDays ?? 3),
    amountTolerance: Number(userSettings?.matchRulesJson?.amountTolerance ?? 0),
    requireCategoryMatch: Boolean(
      userSettings?.matchRulesJson?.requireCategoryMatch ?? false
    ),
  };

  // 查询项目下所有未删除的票据
  const receiptRows = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.userId, userId),
        eq(receipts.projectId, expense.projectId),
        isNull(receipts.deletedAt)
      )
    );

  // 【智能匹配算法】基于规则计算候选票据
  const candidates = receiptRows
    // 1. 过滤：只考虑未匹配或已匹配当前费用的票据
    .filter(
      (receipt: ReceiptRow) =>
        !receipt.matchedExpenseId ||
        receipt.matchedExpenseId === expense.expenseId
    )
    // 2. 映射：计算每个票据的匹配分数
    .map((receipt: ReceiptRow) => {
      const receiptAmount = receipt.receiptAmount
        ? Number(receipt.receiptAmount)
        : null;
      const receiptDate = receipt.receiptDate;

      // 排除没有金额或日期的票据
      if (!receiptAmount || !receiptDate) {
        return null;
      }

      // 计算金额差异
      const amountDiff = Math.abs(Number(expense.amount) - receiptAmount);
      // 金额差异超出容差，排除
      if (amountDiff > rules.amountTolerance) {
        return null;
      }

      // 计算日期差异（天数）
      // daysBetween() - 工具函数，计算两个日期之间的天数
      const dateDiff = Math.abs(
        daysBetween(
          parseDate(expense.date) ?? new Date(),
          parseDate(receiptDate) ?? new Date()
        )
      );

      // 检查类别是否匹配
      const categoryMatch =
        !rules.requireCategoryMatch ||  // 不要求类别匹配
        !expense.category ||             // 费用没有类别
        !receipt.receiptType ||          // 票据没有类别
        expense.category === receipt.receiptType;  // 类别相同

      // 【启发式置信度】基于日期差和类别匹配
      const confidence =
        dateDiff <= 1 && categoryMatch
          ? "high"      // 日期差 ≤ 1天 且 类别匹配 → 高置信度
          : dateDiff <= 3
            ? "medium"  // 日期差 ≤ 3天 → 中置信度
            : "low";    // 其他 → 低置信度

      // 计算分数（用于排序）
      // 基础分：10 - min(日期差, 10)
      // 类别匹配奖励：+2分
      return {
        receiptId: receipt.receiptId,
        confidence,
        reason: `date+/-${dateDiff}d${categoryMatch ? " + category" : ""}`,
        score: 10 - Math.min(dateDiff, 10) + (categoryMatch ? 2 : 0),
      };
    })
    // 3. 过滤：移除 null 值（不符合条件的票据）
    // 【类型守卫】value is ReceiptCandidate - TypeScript 类型缩窄
    .filter((value): value is ReceiptCandidate => value !== null)
    // 4. 排序：按分数降序（分数越高越好）
    .sort((a: ReceiptCandidate, b: ReceiptCandidate) => b.score - a.score)
    // 5. 截取：返回前3个候选
    .slice(0, 3)
    // 6. 映射：只返回需要的字段（不返回 score）
    .map(({ receiptId, confidence, reason }: ReceiptCandidate) => ({
      receiptId,
      confidence,
      reason,
    }));

  return ok(c, candidates);
});

/**
 * 导出路由器
 *
 * 【模块导出】export default - 默认导出
 * - 导入时：import expenseRoutes from "./routes/expenses"
 * - 挂载时：app.route("/api/v1", expenseRoutes)
 */
export default router;
