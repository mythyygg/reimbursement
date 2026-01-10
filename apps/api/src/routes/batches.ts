/**
 * 批次管理路由模块
 *
 * 【Java 对比 - 类似 Spring MVC Controller】
 *
 * 本文件等同于 Spring 的 REST 控制器：
 * ```java
 * @RestController
 * @RequestMapping("/api/v1")
 * @PreAuthorize("isAuthenticated()")
 * public class BatchController {
 *     @Autowired
 *     private BatchService batchService;
 *
 *     @Autowired
 *     private ExportRecordRepository exportRecordRepository;
 *
 *     @GetMapping("/projects/{projectId}/batches")
 *     public ResponseEntity<?> getBatches(
 *         @PathVariable String projectId
 *     ) { ... }
 *
 *     @PostMapping("/projects/{projectId}/batches")
 *     public ResponseEntity<?> createBatch(
 *         @PathVariable String projectId
 *     ) { ... }
 * }
 * ```
 *
 * 【核心功能】
 * 1. 批次管理：
 *    - 创建批次（自动生成名称）
 *    - 查询批次列表
 *    - 查询批次详情
 *    - 删除批次（级联检查）
 *
 * 2. 批次检查：
 *    - 触发批次检查逻辑（现改为同步调用）
 *
 * 3. 导出记录：
 *    - 查询批次的所有导出记录
 *
 * 【批次（Batch）概念】
 * - 批次是一个逻辑分组，用于组织导出任务
 * - 每个批次关联一个项目
 * - 一个批次可以有多个导出记录（CSV、ZIP、PDF）
 * - 批次包含筛选条件（filterJson），定义要导出的数据范围
 *
 * 【批次生命周期】
 * 1. 创建批次 → status=pending
 * 2. 触发检查任务（batch_check）
 * 3. 同步验证数据 → status=checked
 * 4. 创建导出任务 → 生成文件
 * 5. 用户下载导出文件
 * 6. 可选：删除批次
 *
 * 【级联关系】
 * - 批次 ← 导出记录（一对多）
 * - 删除批次前必须先删除所有导出记录
 * - 类似外键约束，但在应用层实现
 */

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm"; // Drizzle ORM 查询构建器
import { batches, exportRecords } from "../db/index.js";
import { db } from "../db/client.js";
import { errorResponse, ok } from "../utils/http.js";
import { processBatchCheckJob } from "../jobs/batch-check.js";

const router = new Hono();

/**
 * GET /api/v1/projects/:projectId/batches - 获取项目批次列表
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/projects/{projectId}/batches")
 * public ResponseEntity<?> getBatches(
 *     @PathVariable String projectId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     List<Batch> batches = batchRepository.findAll(
 *         Specification.where(
 *             BatchSpecs.belongsToUser(userId)
 *                 .and(BatchSpecs.belongsToProject(projectId))
 *         ),
 *         Sort.by("createdAt")
 *     );
 *
 *     return ResponseEntity.ok(batches);
 * }
 * ```
 *
 * 【业务逻辑】
 * - 查询指定项目的所有批次
 * - 按创建时间排序（最早的在前）
 *
 * 【排序规则】
 * - orderBy(batches.createdAt) - 按创建时间升序
 * - 最新创建的批次在最后
 *
 * 【使用场景】
 * - 项目详情页显示批次列表
 * - 查看历史导出批次
 */
router.get("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 查询批次列表
  const data = await db
    .select()
    .from(batches)
    .where(and(eq(batches.userId, userId), eq(batches.projectId, projectId)))
    .orderBy(batches.createdAt);

  return ok(c, data);
});

/**
 * POST /api/v1/projects/:projectId/batches - 创建新批次
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/projects/{projectId}/batches")
 * public ResponseEntity<?> createBatch(
 *     @PathVariable String projectId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 自动生成批次名称
 *     LocalDate today = LocalDate.now();
 *     String name = String.format("%s 导出",
 *         today.format(DateTimeFormatter.ISO_LOCAL_DATE)
 *     );
 *
 *     // 创建批次
 *     Batch batch = new Batch();
 *     batch.setUserId(userId);
 *     batch.setProjectId(projectId);
 *     batch.setName(name);
 *     batch.setFilterJson(new HashMap<>());
 *     batchRepository.save(batch);
 *
 *     // 创建后台检查任务
 *     BackendJob job = new BackendJob();
 *     job.setType("batch_check");
 *     job.setPayload(Map.of("batchId", batch.getBatchId(), "userId", userId));
 *     job.setStatus("pending");
 *     backendJobRepository.save(job);
 *
 *     return ResponseEntity.ok(batch);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 自动生成批次名称（格式：YYYY-MM-DD 导出）
 * 2. 创建批次记录（filterJson 为空对象）
 * 3. 创建后台检查任务（batch_check）
 * 4. 返回新创建的批次
 *
 * 【批次名称生成】
 * - 格式：YYYY-MM-DD 导出
 * - 例如：2023-12-27 导出
 * - 自动添加前导零（01, 02, ...）
 * - padStart(2, "0") - 补齐到2位，类似 Java String.format("%02d")
 *
 * 【filterJson 字段】
 * - 用于存储筛选条件（当前为空对象）
 * - 未来可以扩展支持：
 *   - 日期范围
 *   - 费用状态
 *   - 类别过滤
 * - 类似 Java 的 Map<String, Object>
 *
 * 【后台任务】
 * - batch_check: 验证批次数据的后台任务（现同步执行）
 * - 验证内容：
 *   - 检查项目是否存在
 *   - 统计符合条件的费用和票据
 *   - 更新批次状态
 */
router.post("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 【自动生成批次名称】格式：YYYY-MM-DD 导出
  const today = new Date();
  const name = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")} 导出`;

  // filterJson 设为空对象（未来可扩展筛选条件）
  const filterJson = {};

  // 创建批次记录
  const [batch] = await db
    .insert(batches)
    .values({
      userId,
      projectId,
      name,
      filterJson
    })
    .returning();

  // 直接执行批次检查逻辑，避免额外 Worker 依赖
  await processBatchCheckJob({ batchId: batch.batchId, userId });

  return ok(c, batch);
});

/**
 * GET /api/v1/batches/:batchId - 获取批次详情
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/batches/{batchId}")
 * public ResponseEntity<?> getBatch(
 *     @PathVariable String batchId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Batch batch = batchRepository
 *         .findByBatchIdAndUserId(batchId, userId)
 *         .orElseThrow(() -> new NotFoundException("Batch not found"));
 *
 *     return ResponseEntity.ok(batch);
 * }
 * ```
 *
 * 【业务逻辑】
 * - 查询单个批次的详细信息
 * - 验证权限（属于当前用户）
 *
 * 【使用场景】
 * - 批次详情页
 * - 查看批次状态和统计信息
 *
 * 【错误响应】
 * - 404 BATCH_NOT_FOUND: 批次不存在或无权限
 */
router.get("/batches/:batchId", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");

  // 查询批次记录
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  return ok(c, batch);
});

/**
 * POST /api/v1/batches/:batchId/check - 手动触发批次检查
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/batches/{batchId}/check")
 * public ResponseEntity<?> checkBatch(
 *     @PathVariable String batchId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Batch batch = batchRepository
 *         .findByBatchIdAndUserId(batchId, userId)
 *         .orElseThrow(() -> new NotFoundException("Batch not found"));
 *
 *     // 创建后台检查任务
 *     BackendJob job = new BackendJob();
 *     job.setType("batch_check");
 *     job.setPayload(Map.of("batchId", batchId, "userId", userId));
 *     job.setStatus("pending");
 *     backendJobRepository.save(job);
 *
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 验证批次存在且属于当前用户
 * 2. 创建 batch_check 后台任务
 * 3. 返回成功响应
 *
 * 【使用场景】
 * - 用户手动触发批次数据验证
 * - 数据更新后重新检查批次
 * - 批次创建时自动触发一次
 *
 * 【检查处理步骤】
 * 1. 查询批次关联的项目
 * 2. 根据 filterJson 筛选费用和票据
 * 3. 统计数量和金额
 * 4. 更新批次状态和统计字段
 *
 * 【错误响应】
 * - 404 BATCH_NOT_FOUND: 批次不存在或无权限
 */
router.post("/batches/:batchId/check", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");

  // 验证批次存在
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  // 同步触发检查逻辑
  await processBatchCheckJob({ batchId, userId });

  return ok(c, { success: true });
});

/**
 * GET /api/v1/batches/:batchId/exports - 获取批次的导出记录
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/batches/{batchId}/exports")
 * public ResponseEntity<?> getBatchExports(
 *     @PathVariable String batchId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 验证批次存在
 *     Batch batch = batchRepository
 *         .findByBatchIdAndUserId(batchId, userId)
 *         .orElseThrow(() -> new NotFoundException("Batch not found"));
 *
 *     // 获取导出记录
 *     List<ExportRecord> exports = exportRecordRepository.findAll(
 *         Specification.where(
 *             ExportRecordSpecs.belongsToBatch(batchId)
 *                 .and(ExportRecordSpecs.belongsToUser(userId))
 *         ),
 *         Sort.by(Sort.Direction.DESC, "createdAt")
 *     );
 *
 *     return ResponseEntity.ok(exports);
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 验证批次存在且属于当前用户
 * 2. 查询批次的所有导出记录
 * 3. 按创建时间倒序排列（最新的在前）
 * 4. 返回导出记录列表
 *
 * 【排序规则】
 * - desc(exportRecords.createdAt) - 按创建时间降序
 * - 最新创建的导出在最前面
 *
 * 【使用场景】
 * - 批次详情页显示所有导出记录
 * - 查看批次的导出历史（CSV、ZIP、PDF）
 * - 每个批次可能有多次导出（不同格式）
 *
 * 【错误响应】
 * - 404 BATCH_NOT_FOUND: 批次不存在或无权限
 */
router.get("/batches/:batchId/exports", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");

  // 验证批次存在且属于当前用户
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  // 获取该批次的所有导出记录，按创建时间倒序
  const exports = await db
    .select()
    .from(exportRecords)
    .where(and(eq(exportRecords.batchId, batchId), eq(exportRecords.userId, userId)))
    .orderBy(desc(exportRecords.createdAt));

  return ok(c, exports);
});

/**
 * DELETE /api/v1/batches/:batchId - 删除批次
 *
 * 【Java 对比】类似：
 * ```java
 * @DeleteMapping("/batches/{batchId}")
 * public ResponseEntity<?> deleteBatch(
 *     @PathVariable String batchId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 验证批次存在
 *     Batch batch = batchRepository
 *         .findByBatchIdAndUserId(batchId, userId)
 *         .orElseThrow(() -> new NotFoundException("Batch not found"));
 *
 *     // 检查是否有关联的导出记录
 *     long exportCount = exportRecordRepository.countByBatchId(batchId);
 *     if (exportCount > 0) {
 *         throw new BadRequestException(
 *             "Cannot delete batch with existing exports. " +
 *             "Please delete all exports first."
 *         );
 *     }
 *
 *     // 删除批次
 *     batchRepository.delete(batch);
 *
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 验证批次存在且属于当前用户
 * 2. 检查是否有关联的导出记录
 * 3. 如果有导出记录，返回错误（级联检查）
 * 4. 删除批次（物理删除）
 *
 * 【级联检查】
 * - 删除批次前必须先删除所有导出记录
 * - 防止孤立的导出记录（referential integrity）
 * - 类似外键约束，但在应用层实现
 *
 * 【删除流程】
 * 1. 先删除所有导出记录（DELETE /exports/:exportId）
 * 2. 再删除批次（DELETE /batches/:batchId）
 *
 * 【物理删除】
 * - 批次使用物理删除（DELETE FROM batches）
 * - 不需要保留删除的批次记录
 * - 导出记录也是物理删除
 *
 * 【为什么需要级联检查？】
 * - 保证数据一致性
 * - 避免孤立记录（导出记录指向不存在的批次）
 * - 给用户明确的错误提示
 *
 * 【错误响应】
 * - 404 BATCH_NOT_FOUND: 批次不存在或无权限
 * - 400 BATCH_HAS_EXPORTS: 批次有关联导出，无法删除
 */
router.delete("/batches/:batchId", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");

  // 检查批次是否存在
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  // 【级联检查】检查是否有关联的导出记录
  const exports = await db
    .select()
    .from(exportRecords)
    .where(eq(exportRecords.batchId, batchId));

  if (exports.length > 0) {
    return errorResponse(
      c,
      400,
      "BATCH_HAS_EXPORTS",
      "Cannot delete batch with existing exports. Please delete all exports first."
    );
  }

  // 删除批次（物理删除）
  await db.delete(batches).where(eq(batches.batchId, batchId));

  return ok(c, { success: true });
});

/**
 * 导出路由器
 *
 * 【模块导出】export default - 默认导出
 * - 导入时：import batchRoutes from "./routes/batches"
 * - 挂载时：app.route("/api/v1", batchRoutes)
 */
export default router;
