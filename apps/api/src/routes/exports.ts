/**
 * 导出管理路由模块
 *
 * 【核心功能】
 * 1. 导出任务管理：
 *    - 创建批次导出（基于 batch）
 *    - 创建项目导出（基于 project）
 *    - 查询导出状态
 *    - 生成下载URL
 *    - 删除导出记录
 *
 * 2. 后台处理机制（现同步执行）：
 *    - 创建导出记录（exportRecords 表）
 *    - 调用导出处理逻辑完成文件生成与上传
 *    - 可按需轮询查询状态（兼容前端逻辑）
 *
 * 3. 支持的导出格式：
 *    - HTML: 自包含的报销报告，包含费用清单和票据缩略图
 *
 * 【处理流程】
 * 1. API 接收请求 → 创建 exportRecord (status=pending)
 * 2. 直接执行导出处理 → 更新 exportRecord (status=running → completed)
 * 3. 上传文件到 S3 → 更新 storageKey
 * 4. 前端如需可轮询查询状态
 * 5. 用户点击下载 → 获取预签名URL → 从S3下载
 */

import { Hono } from "hono";
import { z } from "zod"; // Zod 验证库
import { and, eq, inArray } from "drizzle-orm"; // Drizzle ORM 查询构建器
import { batches, downloadLogs, exportRecords, projects } from "../db/index.js";
import { db } from "../db/client.js";
import { createExportDownloadUrl } from "../services/storage.js";
import { errorResponse, ok } from "../utils/http.js";
import { getMissingProjectIds } from "../utils/ownership.js";
import { processExportJob } from "../jobs/export.js";

const router = new Hono();

/**
 * 创建导出请求验证规则
 *
 * 【验证规则】
 * - type: 可选，默认为 html（只支持 html 格式）
 * - projectIds: 可选，字符串数组
 */
const exportCreateSchema = z.object({
  type: z.enum(["html"]).optional().default("html"),
  projectIds: z.array(z.string()).optional(),
});

/**
 * POST /api/v1/batches/:batchId/exports - 创建批次导出
 *
 * 【处理流程】
 * 1. 查询批次记录（验证存在性和权限）
 * 2. 检查是否有运行中的导出（防重复）
 * 3. 创建导出记录（status=pending, type=html）
 * 4. 同步执行导出逻辑
 * 5. 返回导出记录
 *
 * 【错误响应】
 * - 404 BATCH_NOT_FOUND: 批次不存在或无权限
 */
router.post("/batches/:batchId/exports", async (c) => {
  const startTime = Date.now();
  const batchId = c.req.param("batchId");
  console.log(`[exports] [API] 创建批次导出任务开始 - batchId: ${batchId}`);

  const { userId } = c.get("auth");

  // 查询批次记录（验证存在性和权限）
  const t1 = Date.now();
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));
  console.log(`[exports] [DB] 查询batch耗时: ${Date.now() - t1}ms`);

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  // 【防重复检查】查询是否有运行中或等待中的导出
  const t2 = Date.now();
  const existing = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.batchId, batchId),
        eq(exportRecords.userId, userId),
        inArray(exportRecords.status, ["pending", "running"])
      )
    );
  console.log(`[exports] [DB] 查询现有导出耗时: ${Date.now() - t2}ms, 找到 ${existing.length} 条`);

  if (existing.length > 0) {
    // 复用运行中的导出任务（幂等性）
    console.log(`[exports] [API] 复用现有导出任务, 总耗时: ${Date.now() - startTime}ms, exportId: ${existing[0].exportId}`);
    return ok(c, existing[0]);
  }

  // 创建导出记录
  const t3 = Date.now();
  const [record] = await db
    .insert(exportRecords)
    .values({
      batchId,
      userId,
      projectIds: [batch.projectId],
      type: "html",
      status: "pending",
    })
    .returning();
  console.log(`[exports] [DB] 插入导出记录耗时: ${Date.now() - t3}ms`);

  // 直接处理导出，避免额外 Worker 依赖
  const t4 = Date.now();
  await processExportJob({ exportId: record.exportId, userId });
  console.log(`[exports] [API] 创建批次导出并完成处理, 总耗时: ${Date.now() - startTime}ms, exportId: ${record.exportId}`);

  return ok(c, record);
});

/**
 * POST /api/v1/projects/exports - 创建项目导出
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/projects/exports")
 * public ResponseEntity<?> createProjectExport(
 *     @Valid @RequestBody ExportCreateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     List<String> projectIds = dto.getProjectIds();
 *     if (projectIds == null || projectIds.isEmpty()) {
 *         throw new BadRequestException("At least one project must be selected");
 *     }
 *
 *     // 验证项目所有权（简化版本，生产环境应该逐个验证）
 *     // TODO: Verify all projects belong to user
 *
 *     // 创建导出记录
 *     ExportRecord record = new ExportRecord();
 *     record.setUserId(userId);
 *     record.setProjectIds(projectIds);
 *     record.setType(dto.getType());
 *     record.setStatus("pending");
 *     exportRecordRepository.save(record);
 *
 *     // 创建后台任务
 *     BackendJob job = new BackendJob();
 *     job.setType("export");
 *     job.setPayload(Map.of("exportId", record.getExportId(), "userId", userId));
 *     job.setStatus("pending");
 *     backendJobRepository.save(job);
 *
 *     return ResponseEntity.ok(record);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 验证 projectIds 不为空
 * 3. 创建导出记录（status=pending）
 * 4. 创建后台任务
 * 5. 返回导出记录
 *
 * 【与批次导出的区别】
 * - 批次导出：基于 batch，自动填充 projectIds
 * - 项目导出：用户手动选择多个项目
 * - 项目导出可以跨多个项目
 *
 * 【权限验证】
 * - 查询数据库验证所有项目属于当前用户
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 400 MISSING_PROJECTS: projectIds 为空
 */
router.post("/projects/exports", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  console.log(`[exports] [API] 创建项目导出任务开始 - userId: ${userId}`);

  // 验证请求体
  const t0 = Date.now();
  const body = exportCreateSchema.safeParse(await c.req.json());
  console.log(`[exports] 解析请求体耗时: ${Date.now() - t0}ms`);

  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const projectIds = body.data.projectIds;
  console.log(`[exports] 请求导出 ${projectIds?.length || 0} 个项目, 类型: ${body.data.type}`);

  // 验证至少选择一个项目
  if (!projectIds || projectIds.length === 0) {
    return errorResponse(c, 400, "MISSING_PROJECTS", "At least one project must be selected");
  }

  const uniqueProjectIds = [...new Set(projectIds)];
  const tOwnership = Date.now();
  const ownedProjects = await db
    .select({ projectId: projects.projectId })
    .from(projects)
    .where(and(eq(projects.userId, userId), inArray(projects.projectId, uniqueProjectIds)));
  console.log(`[exports] [DB] 查询项目归属耗时: ${Date.now() - tOwnership}ms`);

  const missingProjectIds = getMissingProjectIds(
    uniqueProjectIds,
    ownedProjects.map((project) => project.projectId)
  );
  if (missingProjectIds.length > 0) {
    return errorResponse(c, 403, "PROJECT_FORBIDDEN", "Project access denied");
  }

  // 创建导出记录
  const t1 = Date.now();
  const [record] = await db
    .insert(exportRecords)
    .values({
      userId,
      projectIds: uniqueProjectIds,
      type: body.data.type,
      status: "pending",
    })
    .returning();
  console.log(`[exports] [DB] 插入导出记录耗时: ${Date.now() - t1}ms`);

  // 直接处理导出
  const t2 = Date.now();
  await processExportJob({ exportId: record.exportId, userId });
  console.log(`[exports] [API] 创建项目导出并完成处理, 总耗时: ${Date.now() - startTime}ms, exportId: ${record.exportId}`);

  return ok(c, record);
});

/**
 * GET /api/v1/exports/:exportId - 查询导出状态
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/exports/{exportId}")
 * public ResponseEntity<?> getExportStatus(
 *     @PathVariable String exportId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     ExportRecord record = exportRecordRepository
 *         .findByExportIdAndUserId(exportId, userId)
 *         .orElseThrow(() -> new NotFoundException("Export not found"));
 *
 *     return ResponseEntity.ok(record);
 * }
 * ```
 *
 * 【业务逻辑】
 * - 查询导出记录的当前状态
 * - 前端轮询此接口获取任务进度
 *
 * 【状态说明】
 * - pending: 等待处理（任务在队列中）
 * - running: 正在处理（导出逻辑执行中）
 * - completed: 已完成（可以下载）
 * - failed: 失败（查看 errorMessage 字段）
 *
 * 【轮询模式】
 * 前端通常这样使用：
 * ```typescript
 * const pollExportStatus = async (exportId: string) => {
 *   const interval = setInterval(async () => {
 *     const response = await fetch(`/api/v1/exports/${exportId}`);
 *     const data = await response.json();
 *
 *     if (data.status === 'completed') {
 *       clearInterval(interval);
 *       // 显示下载按钮
 *     } else if (data.status === 'failed') {
 *       clearInterval(interval);
 *       // 显示错误信息
 *     }
 *   }, 2000); // 每2秒轮询一次
 * };
 * ```
 *
 * 【性能优化】
 * - 添加详细的性能日志
 * - 记录查询耗时和状态
 *
 * 【错误响应】
 * - 404 EXPORT_NOT_FOUND: 导出不存在或无权限
 */
router.get("/exports/:exportId", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const exportId = c.req.param("exportId");
  console.log(`[exports] [API] 查询导出状态 - exportId: ${exportId}`);

  // 查询导出记录
  const t1 = Date.now();
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );
  console.log(`[exports] [DB] 查询导出记录耗时: ${Date.now() - t1}ms`);

  if (!record) {
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  console.log(`[exports] [API] 查询导出状态完成, 总耗时: ${Date.now() - startTime}ms, status: ${record.status}`);
  return ok(c, record);
});

/**
 * POST /api/v1/exports/:exportId/download-url - 生成下载URL
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/exports/{exportId}/download-url")
 * public ResponseEntity<?> getDownloadUrl(
 *     @PathVariable String exportId,
 *     Authentication auth,
 *     HttpServletRequest request
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     ExportRecord record = exportRecordRepository
 *         .findByExportIdAndUserId(exportId, userId)
 *         .orElseThrow(() -> new NotFoundException("Export not found"));
 *
 *     if (record.getStorageKey() == null) {
 *         throw new NotFoundException("Export not found");
 *     }
 *
 *     // 检查是否过期
 *     if (record.getExpiresAt() != null &&
 *         record.getExpiresAt().before(new Date())) {
 *         throw new GoneException("Export expired");
 *     }
 *
 *     // 生成友好的文件名
 *     String date = new SimpleDateFormat("yyyy-MM-dd")
 *         .format(record.getCreatedAt());
 *     String filename = String.format("报销导出_%s.%s",
 *         date, record.getType());
 *
 *     // 生成S3预签名下载URL
 *     String signedUrl = s3Service.generateDownloadUrl(
 *         record.getStorageKey(),
 *         filename
 *     );
 *
 *     // 记录下载日志（审计）
 *     DownloadLog log = new DownloadLog();
 *     log.setUserId(userId);
 *     log.setFileType("export");
 *     log.setFileId(exportId);
 *     log.setUserAgent(request.getHeader("User-Agent"));
 *     log.setIp(request.getHeader("X-Forwarded-For"));
 *     downloadLogRepository.save(log);
 *
 *     return ResponseEntity.ok(Map.of("signed_url", signedUrl));
 * }
 * ```
 *
 * 【处理流程】
 * 1. 查询导出记录
 * 2. 验证 storageKey 存在（文件已上传）
 * 3. 检查文件是否过期
 * 4. 生成友好的文件名
 * 5. 生成S3预签名下载URL
 * 6. 记录下载日志（审计）
 * 7. 返回预签名URL
 *
 * 【文件名生成】
 * - 格式：报销导出_YYYY-MM-DD.{type}
 * - 例如：报销导出_2023-12-27.csv
 * - 友好的中文文件名，方便用户识别
 *
 * 【预签名URL机制】
 * - S3存储桶是私有的（不允许公开访问）
 * - 预签名URL提供临时访问权限
 * - 有效期通常为1小时
 * - 防止文件被未授权下载
 *
 * 【过期检查】
 * - expiresAt: 导出文件的过期时间
 * - 过期后返回 410 Gone（资源已删除）
 * - 可由后续清理脚本/任务定期清理过期文件
 *
 * 【下载日志】
 * - 记录用户的下载行为（审计）
 * - 包含 userAgent 和 IP 地址
 * - 用于统计和安全分析
 *
 * 【错误响应】
 * - 404 EXPORT_NOT_FOUND: 导出不存在或无 storageKey
 * - 410 EXPORT_EXPIRED: 导出文件已过期
 */
router.post("/exports/:exportId/download-url", async (c) => {
  const startTime = Date.now();
  const exportId = c.req.param("exportId");
  console.log(`[exports] [API] 生成下载URL开始 - exportId: ${exportId}`);

  const { userId } = c.get("auth");

  // 查询导出记录
  const t1 = Date.now();
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );
  console.log(`[exports] [DB] 查询导出记录耗时: ${Date.now() - t1}ms, status: ${record?.status || 'not found'}`);

  // 验证记录存在且有 storageKey
  if (!record || !record.storageKey) {
    console.log(`[exports] [API] 导出记录不存在或无storageKey, exportId: ${exportId}`);
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  // 检查文件是否过期
  if (record.expiresAt && record.expiresAt < new Date()) {
    console.log(`[exports] [API] 导出文件已过期, exportId: ${exportId}, expiresAt: ${record.expiresAt}`);
    return errorResponse(c, 410, "EXPORT_EXPIRED", "Export expired");
  }

  // 【生成友好的文件名】
  // 格式：报销导出_YYYY-MM-DD.{type}
  // 例如：报销导出_2023-12-27.csv
  const date = record.createdAt.toISOString().split('T')[0];
  const filename = `报销导出_${date}.${record.type}`;
  console.log(`[exports] 生成文件名: ${filename}, storageKey: ${record.storageKey}`);

  // 生成S3预签名下载URL
  const t2 = Date.now();
  const signedUrl = await createExportDownloadUrl({
    storageKey: record.storageKey,
    filename,
  });
  console.log(`[exports] [S3] 生成签名URL耗时: ${Date.now() - t2}ms`);

  // 【记录下载日志】（审计用途）
  const t3 = Date.now();
  await db.insert(downloadLogs).values({
    userId,
    fileType: "export",
    fileId: record.exportId,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });
  console.log(`[exports] [DB] 插入下载日志耗时: ${Date.now() - t3}ms`);
  console.log(`[exports] [API] 生成下载URL完成, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, { signed_url: signedUrl });
});

/**
 * DELETE /api/v1/exports/:exportId - 删除导出记录
 *
 * 【Java 对比】类似：
 * ```java
 * @DeleteMapping("/exports/{exportId}")
 * public ResponseEntity<?> deleteExport(
 *     @PathVariable String exportId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     ExportRecord record = exportRecordRepository
 *         .findByExportIdAndUserId(exportId, userId)
 *         .orElseThrow(() -> new NotFoundException("Export not found"));
 *
 *     // 不允许删除进行中的任务
 *     if ("pending".equals(record.getStatus()) ||
 *         "running".equals(record.getStatus())) {
 *         throw new BadRequestException("Cannot delete export in progress");
 *     }
 *
 *     // 删除记录（物理删除）
 *     exportRecordRepository.delete(record);
 *
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 查询导出记录
 * 2. 验证状态（不允许删除进行中的任务）
 * 3. 删除记录
 *
 * 【删除限制】
 * - 不允许删除 pending 或 running 状态的任务
 * - 防止删除正在处理的任务导致数据不一致
 * - 只能删除 completed 或 failed 状态的任务
 *
 * 【物理删除】
 * - 导出记录使用物理删除（DELETE FROM export_records）
 * - 不需要保留删除的导出记录
 * - S3 文件可由后续清理脚本定期清理
 *
 * 【错误响应】
 * - 404 EXPORT_NOT_FOUND: 导出不存在或无权限
 * - 400 EXPORT_IN_PROGRESS: 导出任务进行中，无法删除
 */
router.delete("/exports/:exportId", async (c) => {
  const { userId } = c.get("auth");
  const exportId = c.req.param("exportId");

  // 查询导出记录
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );

  if (!record) {
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  // 【删除限制】不允许删除进行中的任务
  // 防止删除正在处理的任务导致导出逻辑出错
  if (record.status === "pending" || record.status === "running") {
    return errorResponse(c, 400, "EXPORT_IN_PROGRESS", "Cannot delete export in progress");
  }

  // 删除导出记录（物理删除）
  await db
    .delete(exportRecords)
    .where(eq(exportRecords.exportId, exportId));

  return ok(c, { success: true });
});

/**
 * 导出路由器
 *
 * 【模块导出】export default - 默认导出
 * - 导入时：import exportRoutes from "./routes/exports"
 * - 挂载时：app.route("/api/v1", exportRoutes)
 */
export default router;
