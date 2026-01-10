/**
 * 票据管理路由模块
 *
 * 【Java 对比 - 类似 Spring MVC Controller + Service】
 *
 * 本文件等同于 Spring 的文件上传控制器：
 * ```java
 * @RestController
 * @RequestMapping("/api/v1")
 * @PreAuthorize("isAuthenticated()")
 * public class ReceiptController {
 *     @Autowired
 *     private S3Service s3Service;
 *
 *     @Autowired
 *     private ReceiptService receiptService;
 *
 *     @GetMapping("/projects/{projectId}/receipts")
 *     public ResponseEntity<?> getReceipts(@PathVariable String projectId) { ... }
 *
 *     @PostMapping("/receipts/{receiptId}/upload-url")
 *     public ResponseEntity<?> createUploadUrl(
 *         @PathVariable String receiptId,
 *         @RequestBody UploadUrlDto dto
 *     ) { ... }
 * }
 * ```
 *
 * 【核心功能】
 * 1. 票据上传（三步流程）：
 *    - 步骤1: 创建票据记录（POST /projects/:projectId/receipts）
 *    - 步骤2: 获取预签名上传URL（POST /receipts/:receiptId/upload-url）
 *    - 步骤3: 前端直传S3后通知完成（POST /receipts/:receiptId/complete）
 *
 * 2. 票据管理：
 *    - 查询票据列表（支持过滤）
 *    - 更新票据信息（OCR结果修正）
 *    - 软删除票据
 *
 * 3. 智能匹配：
 *    - 获取单个票据的费用匹配候选
 *    - 批量获取多个票据的候选（性能优化）
 *    - 手动匹配/取消匹配费用
 *
 * 【预签名URL机制】
 * - 不直接上传文件到后端服务器（避免内存/带宽消耗）
 * - 后端生成临时的S3预签名URL（有效期15分钟）
 * - 前端直接上传到S3
 * - 上传完成后通知后端更新状态
 *
 * 【软删除机制】
 * - 票据使用软删除（设置deletedAt）
 * - 保留审计记录
 * - 可以恢复（清空deletedAt）
 *
 * 【事务处理】
 * - 匹配/取消匹配使用数据库事务
 * - 确保票据-费用关联的数据一致性
 */

import { Hono } from "hono";
import { z } from "zod"; // Zod 验证库
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"; // Drizzle ORM 查询构建器
import {
  expenseReceipts,
  expenses,
  receipts,
  settings,
  uploadSessions,
  downloadLogs,
} from "../db/index.js";
import { getReceiptCandidates } from "../utils/index.js";
import { db } from "../db/client.js";
import {
  createReceiptUploadUrl,
  createReceiptDownloadUrl,
} from "../services/storage.js";
import { config } from "../config.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

/**
 * 创建票据请求验证规则
 *
 * 【幂等性设计】
 * - client_request_id: 客户端请求ID（可选）
 * - 用于防止重复创建（网络重试、用户误操作）
 * - 相同client_request_id的请求返回已存在的票据
 */
const receiptCreateSchema = z.object({
  client_request_id: z.string().optional(),
});

/**
 * 获取上传URL请求验证规则
 *
 * 【文件上传信息】
 * - file_ext: 文件扩展名（如 "jpg", "png", "pdf"）
 * - content_type: MIME类型（如 "image/jpeg", "application/pdf"）
 * - file_size: 文件大小（字节）
 */
const uploadUrlSchema = z.object({
  file_ext: z.string().min(1),
  content_type: z.string().min(1),
  file_size: z.number().positive(),
});

function normalizeExtension(input: string) {
  return input.trim().toLowerCase().replace(/^\./, "");
}

function validateUploadRequest(input: {
  fileExt: string;
  contentType: string;
  fileSize: number;
}) {
  if (input.fileSize > config.uploadMaxBytes) {
    return { code: "UPLOAD_TOO_LARGE", status: 413, message: "File too large" };
  }

  if (!config.uploadAllowedMimeTypes.includes(input.contentType)) {
    return { code: "UNSUPPORTED_MEDIA_TYPE", status: 415, message: "Unsupported content type" };
  }

  if (!config.uploadAllowedExtensions.includes(input.fileExt)) {
    return { code: "UNSUPPORTED_MEDIA_TYPE", status: 415, message: "Unsupported file extension" };
  }

  return null;
}

/**
 * 完成上传请求验证规则
 *
 * 【去重机制】
 * - hash: 文件哈希值（如SHA256）
 * - 用于检测重复上传的票据
 * - 相同hash的票据会被标记为duplicateFlag=true
 */
const completeSchema = z.object({
  hash: z.string().min(6),
});

/**
 * 更新票据请求验证规则
 *
 * 【OCR结果修正】
 * - merchant_keyword: 商户名称
 * - receipt_amount: 票据金额
 * - receipt_date: 票据日期
 * - receipt_type: 票据类型/类别
 */
const receiptUpdateSchema = z.object({
  merchant_keyword: z.string().optional(),
  receipt_amount: z.number().optional(),
  receipt_date: z.string().datetime().optional(),
  receipt_type: z.string().optional(),
});

/**
 * 匹配费用请求验证规则
 *
 * 【匹配/取消匹配】
 * - expense_id: 费用ID（null表示取消匹配）
 */
const matchSchema = z.object({
  expense_id: z.string().uuid().nullable(),
});

/**
 * 批量获取候选请求验证规则
 *
 * 【性能优化】
 * - 一次请求获取多个票据的匹配候选
 * - 限制最多50个（防止请求过大）
 */
const batchCandidatesSchema = z.object({
  receipt_ids: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * GET /api/v1/projects/:projectId/receipts - 获取项目票据列表
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping("/projects/{projectId}/receipts")
 * public ResponseEntity<?> getReceipts(
 *     @PathVariable String projectId,
 *     @RequestParam(required = false) Boolean matched,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Specification<Receipt> spec = Specification.where(
 *         ReceiptSpecs.belongsToUser(userId)
 *             .and(ReceiptSpecs.belongsToProject(projectId))
 *             .and(ReceiptSpecs.notDeleted())
 *     );
 *
 *     if (matched != null) {
 *         spec = matched
 *             ? spec.and(ReceiptSpecs.isMatched())
 *             : spec.and(ReceiptSpecs.notMatched());
 *     }
 *
 *     List<Receipt> receipts = receiptRepository.findAll(spec);
 *
 *     // 为每个票据生成预签名下载URL
 *     List<ReceiptWithUrl> result = receipts.stream()
 *         .map(receipt -> {
 *             String signedUrl = s3Service.generateDownloadUrl(receipt.getStorageKey());
 *             return new ReceiptWithUrl(receipt, signedUrl);
 *         })
 *         .collect(Collectors.toList());
 *
 *     return ResponseEntity.ok(result);
 * }
 * ```
 *
 * 【查询参数】
 * - matched: 是否已匹配费用（undefined=全部, true=已匹配, false=未匹配）
 *
 * 【查询流程】
 * 1. 根据条件查询票据列表
 * 2. 为每个票据生成S3预签名下载URL
 * 3. 返回票据列表（包含fileUrl）
 *
 * 【软删除过滤】
 * - isNull(receipts.deletedAt) - 只查询未删除的票据
 *
 * 【Promise.all并发处理】
 * - 并发生成所有票据的预签名URL
 * - 比串行处理快得多
 * - 类似 Java CompletableFuture.allOf()
 */
router.get("/projects/:projectId/receipts", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const matched = c.req.query("matched");

  // 构建过滤条件
  const filters = [
    eq(receipts.userId, userId),
    eq(receipts.projectId, projectId),
    isNull(receipts.deletedAt), // 软删除过滤
  ];

  // 处理匹配状态过滤
  if (matched !== undefined) {
    filters.push(
      matched === "true"
        // SQL: matchedExpenseId IS NOT NULL
        ? sql`${receipts.matchedExpenseId} is not null`
        // SQL: matchedExpenseId IS NULL
        : sql`${receipts.matchedExpenseId} is null`
    );
  }

  // 查询票据列表
  const t1 = Date.now();
  const data = await db
    .select()
    .from(receipts)
    .where(and(...filters));
  console.log(`[receipts] [DB] 查询票据列表耗时: ${Date.now() - t1}ms - 返回 ${data.length} 张`);

  // 使用 CDN 域名返回可访问的预览 URL（避免暴露上传域名）
  const t2 = Date.now();
  const withPublicUrls = data.map((item) => {
    if (item.storageKey && config.s3PublicBaseUrl) {
      return { ...item, fileUrl: `${config.s3PublicBaseUrl}/${item.storageKey}` };
    }
    return item;
  });
  console.log(`[receipts] [CDN] 生成 ${data.length} 个公开URL耗时: ${Date.now() - t2}ms, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, withPublicUrls);
});

/**
 * POST /api/v1/projects/:projectId/receipts - 创建票据记录（上传步骤1）
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/projects/{projectId}/receipts")
 * public ResponseEntity<?> createReceipt(
 *     @PathVariable String projectId,
 *     @RequestBody ReceiptCreateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 幂等性检查：如果clientRequestId已存在，返回已有记录
 *     if (dto.getClientRequestId() != null) {
 *         Optional<Receipt> existing = receiptRepository
 *             .findByUserIdAndProjectIdAndClientRequestId(
 *                 userId, projectId, dto.getClientRequestId()
 *             );
 *         if (existing.isPresent()) {
 *             return ResponseEntity.ok(existing.get());
 *         }
 *     }
 *
 *     // 创建新票据记录
 *     Receipt receipt = new Receipt();
 *     receipt.setUserId(userId);
 *     receipt.setProjectId(projectId);
 *     receipt.setClientRequestId(dto.getClientRequestId());
 *     receipt.setUploadStatus("pending");
 *     receiptRepository.save(receipt);
 *
 *     return ResponseEntity.ok(receipt);
 * }
 * ```
 *
 * 【上传流程第1步】
 * - 创建票据记录，状态为pending
 * - 返回receiptId给前端
 * - 前端用receiptId获取上传URL（步骤2）
 *
 * 【幂等性设计】
 * - client_request_id: 客户端生成的唯一ID
 * - 防止网络重试导致重复创建
 * - 如果已存在，直接返回已有记录
 *
 * 【为什么分步上传？】
 * - 先创建记录，后上传文件
 * - 支持断点续传
 * - 记录上传历史
 * - 可以跟踪上传进度
 */
router.post("/projects/:projectId/receipts", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = receiptCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 幂等性检查：查询是否已存在相同clientRequestId的票据
  if (body.data.client_request_id) {
    const existing = await db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.userId, userId),
          eq(receipts.projectId, projectId),
          eq(receipts.clientRequestId, body.data.client_request_id)
        )
      );
    if (existing.length > 0) {
      // 已存在，返回已有记录（幂等）
      return ok(c, existing[0]);
    }
  }

  // 创建新票据记录
  const [receipt] = await db
    .insert(receipts)
    .values({
      userId,
      projectId,
      clientRequestId: body.data.client_request_id,
      uploadStatus: "pending", // 初始状态：等待上传
    })
    .returning();

  console.log("[api][receipt][create] pending", {
    receiptId: receipt.receiptId,
    userId,
    projectId,
  });
  return ok(c, receipt);
});

/**
 * POST /api/v1/receipts/:receiptId/upload-url - 获取上传URL（上传步骤2）
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/receipts/{receiptId}/upload-url")
 * public ResponseEntity<?> getUploadUrl(
 *     @PathVariable String receiptId,
 *     @RequestBody UploadUrlDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Receipt receipt = receiptRepository.findById(receiptId)
 *         .orElseThrow(() -> new NotFoundException());
 *
 *     if (!receipt.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     // 生成S3预签名上传URL
 *     String storageKey = generateStorageKey(userId, projectId, receiptId);
 *     PresignedUrl presignedUrl = s3Service.generateUploadUrl(
 *         storageKey,
 *         dto.getContentType(),
 *         15 * 60 // 15分钟有效期
 *     );
 *
 *     // 更新票据记录
 *     receipt.setStorageKey(storageKey);
 *     receipt.setFileExt(dto.getFileExt());
 *     receipt.setFileSize(dto.getFileSize());
 *     receiptRepository.save(receipt);
 *
 *     // 记录上传会话
 *     UploadSession session = new UploadSession();
 *     session.setReceiptId(receiptId);
 *     session.setStorageKey(storageKey);
 *     session.setExpireAt(new Date(System.currentTimeMillis() + 15 * 60 * 1000));
 *     uploadSessionRepository.save(session);
 *
 *     return ResponseEntity.ok(Map.of(
 *         "signed_url", presignedUrl.getUrl(),
 *         "public_url", presignedUrl.getPublicUrl()
 *     ));
 * }
 * ```
 *
 * 【上传流程第2步】
 * - 生成S3预签名上传URL
 * - 返回给前端用于直传S3
 * - 记录上传会话（uploadSessions表）
 *
 * 【预签名URL机制】
 * - 临时授权：只能上传到指定的key
 * - 有效期：15分钟
 * - 安全性：URL包含签名，无法伪造
 * - 前端直传：不经过后端服务器，节省带宽
 *
 * 【为什么需要uploadSessions表？】
 * - 审计：记录所有上传会话
 * - 调试：排查上传失败问题
 * - 清理：定期删除过期会话
 */
router.post("/receipts/:receiptId/upload-url", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = uploadUrlSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const fileExt = normalizeExtension(body.data.file_ext);
  const contentType = body.data.content_type.trim().toLowerCase();
  const fileSize = body.data.file_size;
  const validationError = validateUploadRequest({
    fileExt,
    contentType,
    fileSize,
  });
  if (validationError) {
    return errorResponse(c, validationError.status, validationError.code, validationError.message);
  }

  // 查询票据记录（验证权限）
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  // 生成S3预签名上传URL
  const upload = await createReceiptUploadUrl({
    userId,
    projectId: receipt.projectId,
    receiptId,
    extension: fileExt,
    contentType,
  });

  // 更新票据记录
  await db
    .update(receipts)
    .set({
      fileExt,
      fileSize,
      storageKey: upload.storageKey,
      uploadStatus: "pending", // 仍然是pending，等待前端上传完成
      updatedAt: new Date(),
    })
    .where(eq(receipts.receiptId, receiptId));

  // 记录上传会话（用于审计和调试）
  await db.insert(uploadSessions).values({
    receiptId,
    userId,
    signedUrl: upload.signedUrl,
    expireAt: new Date(Date.now() + 15 * 60 * 1000), // 15分钟后过期
    storageKey: upload.storageKey,
    contentType,
    maxSize: fileSize,
    status: "created",
  });

  return ok(c, { signed_url: upload.signedUrl, public_url: upload.publicUrl });
});

/**
 * POST /api/v1/receipts/:receiptId/complete - 完成上传（上传步骤3）
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/receipts/{receiptId}/complete")
 * public ResponseEntity<?> completeUpload(
 *     @PathVariable String receiptId,
 *     @RequestBody CompleteDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Receipt receipt = receiptRepository.findById(receiptId)
 *         .orElseThrow(() -> new NotFoundException());
 *
 *     // 检查是否有重复文件（相同hash）
 *     List<Receipt> duplicates = receiptRepository
 *         .findByProjectIdAndHashAndNotDeleted(
 *             receipt.getProjectId(), dto.getHash()
 *         );
 *
 *     // 更新票据状态
 *     receipt.setHash(dto.getHash());
 *     receipt.setUploadStatus("uploaded");
 *     receipt.setDuplicateFlag(duplicates.size() > 0);
 *     receipt.setFileUrl(buildPublicUrl(receipt.getStorageKey()));
 *     receiptRepository.save(receipt);
 *
 *     // 更新上传会话状态
 *     uploadSessionRepository.updateStatusByReceiptId(
 *         receiptId, "completed"
 *     );
 *
 *     return ResponseEntity.ok(receipt);
 * }
 * ```
 *
 * 【上传流程第3步】
 * - 前端上传完成后调用此接口
 * - 更新票据状态为uploaded
 * - 检测重复文件
 * - 更新上传会话状态
 *
 * 【去重检测】
 * - 使用文件hash（如SHA256）
 * - 同一项目内相同hash视为重复
 * - 标记duplicateFlag但不阻止上传
 * - 用户可以手动删除重复项
 *
 * 【fileUrl生成】
 * - 使用S3_PUBLIC_BASE_URL + storageKey
 * - 如果配置了CDN，会通过CDN访问（更快）
 * - 用于前端展示和下载
 */
router.post("/receipts/:receiptId/complete", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = completeSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 查询票据记录
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  // 检查是否有重复文件（相同hash）
  const duplicate = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.projectId, receipt.projectId),
        eq(receipts.hash, body.data.hash),
        isNull(receipts.deletedAt) // 只检查未删除的票据
      )
    );

  // 生成公开访问URL
  // 【三元运算符】类似 Java 的 condition ? valueIfTrue : valueIfFalse
  const fileUrl = receipt.storageKey
    ? `${config.s3PublicBaseUrl}/${receipt.storageKey}`
    : receipt.fileUrl;

  // 更新票据状态
  const [updated] = await db
    .update(receipts)
    .set({
      hash: body.data.hash,
      fileUrl,
      uploadStatus: "uploaded", // 标记为已上传
      duplicateFlag: duplicate.length > 0, // 是否重复
      updatedAt: new Date(),
    })
    .where(eq(receipts.receiptId, receiptId))
    .returning();

  const projectId = receipt.projectId;
  console.log("[api][receipt][complete]", {
    receiptId,
    userId,
    projectId,
    storageKey: updated?.storageKey,
  });

  // 更新上传会话状态
  await db
    .update(uploadSessions)
    .set({ status: "completed" })
    .where(eq(uploadSessions.receiptId, receiptId));

  if (!updated) {
    return errorResponse(c, 500, "UPLOAD_NOT_COMPLETE", "Receipt not updated");
  }

  return ok(c, updated);
});

/**
 * PATCH /api/v1/receipts/:receiptId - 更新票据信息
 *
 * 【业务场景】
 * - OCR识别后，用户手动修正错误信息
 * - 修改商户名称、金额、日期、类型
 *
 * 【动态构建更新对象】
 * - 只更新提供的字段
 * - 使用Record<string, unknown>类型
 * - 类似 Java 的 Map<String, Object>
 */
router.patch("/receipts/:receiptId", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = receiptUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 动态构建更新对象
  // 【Record<string, unknown>】类似 Java 的 Map<String, Object>
  const update: Record<string, unknown> = { updatedAt: new Date() };

  // 只添加提供的字段（undefined !== 检查）
  if (body.data.merchant_keyword !== undefined) {
    update.merchantKeyword = body.data.merchant_keyword;
  }
  if (body.data.receipt_amount !== undefined) {
    // 金额转为字符串存储（避免浮点精度问题）
    update.receiptAmount = String(body.data.receipt_amount);
  }
  if (body.data.receipt_date !== undefined) {
    update.receiptDate = new Date(body.data.receipt_date);
  }
  if (body.data.receipt_type !== undefined) {
    update.receiptType = body.data.receipt_type;
  }

  // 更新票据
  const [receipt] = await db
    .update(receipts)
    .set(update)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)))
    .returning();

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  return ok(c, receipt);
});

/**
 * PATCH /api/v1/receipts/:receiptId/match - 匹配/取消匹配费用
 *
 * 【Java 对比】类似：
 * ```java
 * @PatchMapping("/receipts/{receiptId}/match")
 * @Transactional
 * public ResponseEntity<?> matchExpense(
 *     @PathVariable String receiptId,
 *     @RequestBody MatchDto dto,
 *     Authentication auth
 * ) {
 *     if (dto.getExpenseId() == null) {
 *         // 取消匹配
 *         unmatchReceipt(receiptId);
 *     } else {
 *         // 匹配费用
 *         matchReceipt(receiptId, dto.getExpenseId());
 *     }
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务逻辑】
 * 1. 取消匹配（expense_id = null）：
 *    - 删除expenseReceipts关联记录
 *    - 清空receipt.matchedExpenseId
 *    - 如果费用没有其他票据，状态改为pending
 *
 * 2. 匹配费用（expense_id != null）：
 *    - 检查票据是否已匹配其他费用（防止重复匹配）
 *    - 创建expenseReceipts关联记录
 *    - 设置receipt.matchedExpenseId
 *    - 费用状态改为processing
 *
 * 【事务处理】
 * - db.transaction() - 确保数据一致性
 * - 类似 Java @Transactional
 * - 如果中间失败，全部回滚
 *
 * 【自动状态管理】
 * - manualStatus=false: 自动根据票据数量更新状态
 * - manualStatus=true: 用户手动设置状态，不自动变更
 */
router.patch("/receipts/:receiptId/match", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = matchSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 查询票据记录
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  // 情况1: 取消匹配（expense_id = null）
  if (body.data.expense_id === null) {
    // 【事务】确保所有操作原子性
    await db.transaction(async (tx) => {
      if (receipt.matchedExpenseId) {
        // 删除关联记录
        await tx
          .delete(expenseReceipts)
          .where(eq(expenseReceipts.receiptId, receiptId));

        // 清空票据的matchedExpenseId
        await tx
          .update(receipts)
          .set({ matchedExpenseId: null, updatedAt: new Date() })
          .where(eq(receipts.receiptId, receiptId));

        // 查询费用信息
        const [expense] = await tx
          .select()
          .from(expenses)
          .where(eq(expenses.expenseId, receipt.matchedExpenseId));

        // 如果费用是自动状态管理
        if (expense && !expense.manualStatus) {
          // 检查费用是否还有其他票据
          const remaining = await tx
            .select()
            .from(expenseReceipts)
            .where(eq(expenseReceipts.expenseId, expense.expenseId));

          // 如果没有其他票据了，状态改回pending
          if (remaining.length === 0) {
            await tx
              .update(expenses)
              .set({ status: "pending", updatedAt: new Date() })
              .where(eq(expenses.expenseId, expense.expenseId));
          }
        }
      }
    });

    return ok(c, { success: true });
  }

  // 情况2: 匹配费用（expense_id != null）
  const expenseId = body.data.expense_id;

  // 查询费用记录（验证权限和存在性）
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  try {
    await db.transaction(async (tx) => {
      // 重新查询票据（防止并发修改）
      const [freshReceipt] = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.receiptId, receiptId));

      // 检查票据是否已匹配其他费用
      if (
        freshReceipt?.matchedExpenseId &&
        freshReceipt.matchedExpenseId !== expenseId
      ) {
        throw new Error("RECEIPT_ALREADY_MATCHED");
      }

      // 先删除旧的关联（如果有）
      await tx
        .delete(expenseReceipts)
        .where(eq(expenseReceipts.receiptId, receiptId));

      // 创建新的关联
      await tx.insert(expenseReceipts).values({ expenseId, receiptId });

      // 更新票据的matchedExpenseId
      await tx
        .update(receipts)
        .set({ matchedExpenseId: expenseId, updatedAt: new Date() })
        .where(eq(receipts.receiptId, receiptId));

      // 如果费用是自动状态管理，更新为processing
      if (!expense.manualStatus) {
        await tx
          .update(expenses)
          .set({ status: "processing", updatedAt: new Date() })
          .where(eq(expenses.expenseId, expenseId));
      }
    });
  } catch (error) {
    // 捕获自定义错误
    if (error instanceof Error && error.message === "RECEIPT_ALREADY_MATCHED") {
      return errorResponse(
        c,
        409,
        "RECEIPT_ALREADY_MATCHED",
        "Receipt already matched"
      );
    }
    throw error; // 其他错误继续抛出
  }

  return ok(c, { success: true });
});

/**
 * GET /api/v1/receipts/:receiptId/candidates - 获取匹配候选
 *
 * 【业务逻辑】
 * - 根据票据信息（金额、日期、商户、类别）
 * - 从项目的所有费用中找出匹配度高的候选
 * - 使用智能匹配算法计算相似度
 *
 * 【匹配规则】（可在用户设置中配置）
 * - dateWindowDays: 日期容差（默认3天）
 * - amountTolerance: 金额容差（默认0）
 * - requireCategoryMatch: 是否要求类别匹配
 *
 * 【性能优化】
 * - 使用LEFT JOIN一次性查询票据、设置、已匹配费用
 * - 避免多次数据库查询
 * - 添加详细的性能日志
 */
router.get("/receipts/:receiptId/candidates", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  // 优化：合并查询 - 一次性获取票据、用户设置、已匹配费用
  let t1 = Date.now();
  const result = await db
    .select({
      receipt: receipts,
      settings: settings,
      matchedExpense: expenses,
    })
    .from(receipts)
    .leftJoin(settings, eq(settings.userId, receipts.userId))
    .leftJoin(
      expenses,
      and(
        eq(expenses.expenseId, receipts.matchedExpenseId),
        eq(expenses.userId, receipts.userId)
      )
    )
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)))
    .limit(1);
  console.log(`[receipts] [DB] 合并查询(票据+设置+已匹配费用)耗时: ${Date.now() - t1}ms`);

  if (result.length === 0) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  const { receipt, settings: userSettings, matchedExpense } = result[0];

  // 读取用户配置的匹配规则（使用默认值）
  // 【?? 运算符】空值合并，类似 Java Optional.orElse()
  const rules = {
    dateWindowDays: Number(userSettings?.matchRulesJson?.dateWindowDays ?? 3),
    amountTolerance: Number(userSettings?.matchRulesJson?.amountTolerance ?? 0),
    requireCategoryMatch: Boolean(
      userSettings?.matchRulesJson?.requireCategoryMatch ?? false
    ),
  };

  // 查询项目所有费用
  t1 = Date.now();
  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.projectId, receipt.projectId)
      )
    );
  console.log(`[receipts] [DB] 查询项目所有费用耗时: ${Date.now() - t1}ms - 返回 ${expenseRows.length} 条`);

  // 调用智能匹配算法
  t1 = Date.now();
  const candidates = getReceiptCandidates(
    {
      amount: receipt.receiptAmount
        ? Number(receipt.receiptAmount)
        : null,
      date: receipt.receiptDate,
      category: receipt.receiptType,
      note: receipt.merchantKeyword,
    },
    expenseRows.map((expense) => ({
      expenseId: expense.expenseId,
      amount: Number(expense.amount),
      date: expense.date,
      category: expense.category,
      note: expense.note,
    })),
    rules
  );
  console.log(`[receipts] 计算匹配候选耗时: ${Date.now() - t1}ms - 找到 ${candidates.length} 个候选`);

  // 构建费用ID到费用对象的映射（快速查找）
  // 【Map数据结构】类似 Java HashMap
  t1 = Date.now();
  const expenseById = new Map(
    expenseRows.map((expense) => [expense.expenseId, expense])
  );
  console.log(`[receipts] 构建expenseById Map耗时: ${Date.now() - t1}ms`);

  // 增强候选数据，添加费用详情
  t1 = Date.now();
  const responseCandidates =
    candidates.length > 0
      ? candidates.map((candidate: any) => {
        const expense = expenseById.get(candidate.expenseId);
        return {
          ...candidate,
          note: (expense as any)?.note ?? null,
          amount: expense ? Number((expense as any).amount) : null,
          date: (expense as any)?.date ?? null,
          status: (expense as any)?.status ?? null,
        };
      })
      // 如果没有匹配候选，返回所有费用（手动选择）
      : expenseRows.map((expense) => ({
        expenseId: expense.expenseId,
        confidence: "high",
        reason: "manual selection",
        note: expense.note,
        amount: Number(expense.amount),
        date: expense.date,
        status: expense.status,
      }));
  console.log(`[receipts] 构建responseCandidates耗时: ${Date.now() - t1}ms - 共 ${responseCandidates.length} 条`);

  // 确保已匹配的费用在候选列表中
  if (
    matchedExpense &&
    !responseCandidates.some(
      (item: any) => item.expenseId === matchedExpense!.expenseId
    )
  ) {
    // 【unshift】添加到数组开头，类似 Java list.add(0, item)
    responseCandidates.unshift({
      expenseId: matchedExpense.expenseId,
      confidence: "high",
      reason: "already matched",
      note: matchedExpense.note,
      amount: Number(matchedExpense.amount),
      date: matchedExpense.date,
      status: matchedExpense.status,
    });
  }

  console.log(`[receipts] 获取候选完成, 总耗时: ${Date.now() - startTime}ms`);
  return ok(c, responseCandidates);
});

/**
 * POST /api/v1/receipts/batch-candidates - 批量获取匹配候选（性能优化版）
 *
 * 【性能优化】
 * - 单个候选查询：N次数据库查询（N个票据）
 * - 批量候选查询：2次数据库查询（1次票据+设置，1次费用）
 * - 大幅减少数据库往返次数
 *
 * 【批量查询策略】
 * 1. 使用inArray()一次查询所有票据
 * 2. 使用inArray()一次查询所有项目的费用
 * 3. 在内存中为每个票据计算候选
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/receipts/batch-candidates")
 * public ResponseEntity<?> batchGetCandidates(
 *     @RequestBody BatchCandidatesDto dto
 * ) {
 *     // 批量查询票据
 *     List<Receipt> receipts = receiptRepository
 *         .findAllById(dto.getReceiptIds());
 *
 *     // 提取项目ID
 *     Set<String> projectIds = receipts.stream()
 *         .map(Receipt::getProjectId)
 *         .collect(Collectors.toSet());
 *
 *     // 批量查询费用
 *     List<Expense> expenses = expenseRepository
 *         .findByProjectIdIn(projectIds);
 *
 *     // 按项目分组
 *     Map<String, List<Expense>> expensesByProject = expenses.stream()
 *         .collect(Collectors.groupingBy(Expense::getProjectId));
 *
 *     // 为每个票据计算候选
 *     Map<String, List<Candidate>> result = new HashMap<>();
 *     for (Receipt receipt : receipts) {
 *         List<Expense> projectExpenses =
 *             expensesByProject.get(receipt.getProjectId());
 *         List<Candidate> candidates =
 *             matchingService.getCandidates(receipt, projectExpenses);
 *         result.put(receipt.getReceiptId(), candidates);
 *     }
 *
 *     return ResponseEntity.ok(result);
 * }
 * ```
 */
router.post("/receipts/batch-candidates", async (c) => {
  const handlerStartTime = Date.now();
  console.log(`[receipts] [Handler] 业务逻辑开始`);

  const { userId } = c.get("auth");

  const t0 = Date.now();
  const body = await c.req.json();
  console.log(`[receipts] 解析请求体耗时: ${Date.now() - t0}ms`);

  const t00 = Date.now();
  const parsed = batchCandidatesSchema.safeParse(body);
  console.log(`[receipts] 验证请求体耗时: ${Date.now() - t00}ms`);

  if (!parsed.success) {
    return errorResponse(c, 400, "INVALID_REQUEST", "Invalid request body");
  }

  const { receipt_ids } = parsed.data;

  let t1 = Date.now();
  // 1. 批量查询所有票据及其设置、已匹配费用
  // 【inArray】IN 查询，类似 SQL: WHERE receipt_id IN (...)
  const receiptsData = await db
    .select({
      receipt: receipts,
      settings: settings,
      matchedExpense: expenses,
    })
    .from(receipts)
    .leftJoin(settings, eq(settings.userId, receipts.userId))
    .leftJoin(
      expenses,
      and(
        eq(expenses.expenseId, receipts.matchedExpenseId),
        eq(expenses.userId, receipts.userId)
      )
    )
    .where(
      and(
        inArray(receipts.receiptId, receipt_ids),
        eq(receipts.userId, userId)
      )
    );
  console.log(`[receipts] [DB] 批量查询${receipt_ids.length}个票据耗时: ${Date.now() - t1}ms`);

  if (receiptsData.length === 0) {
    console.log(`[receipts] [Handler] 业务逻辑结束（空结果）, 总耗时: ${Date.now() - handlerStartTime}ms`);
    return ok(c, {});
  }

  // 获取所有涉及的项目ID
  // 【Set去重】类似 Java Stream.collect(Collectors.toSet())
  const projectIds = [...new Set(receiptsData.map((r) => r.receipt.projectId))];

  // 2. 批量查询所有项目的费用
  t1 = Date.now();
  const allExpenses = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        inArray(expenses.projectId, projectIds)
      )
    );
  console.log(`[receipts] [DB] 批量查询${projectIds.length}个项目的费用耗时: ${Date.now() - t1}ms - 返回 ${allExpenses.length} 条`);

  // 3. 按项目分组费用（内存分组）
  // 【Map分组】类似 Java Stream.collect(Collectors.groupingBy())
  const expensesByProject = new Map<string, typeof allExpenses>();
  for (const expense of allExpenses) {
    const projectId = expense.projectId;
    if (!expensesByProject.has(projectId)) {
      expensesByProject.set(projectId, []);
    }
    expensesByProject.get(projectId)!.push(expense);
  }

  // 4. 为每个票据计算候选
  t1 = Date.now();
  const result: Record<string, any[]> = {};

  for (const { receipt, settings: userSettings, matchedExpense } of receiptsData) {
    const rules = {
      dateWindowDays: Number(userSettings?.matchRulesJson?.dateWindowDays ?? 3),
      amountTolerance: Number(userSettings?.matchRulesJson?.amountTolerance ?? 0),
      requireCategoryMatch: Boolean(
        userSettings?.matchRulesJson?.requireCategoryMatch ?? false
      ),
    };

    const projectExpenses = expensesByProject.get(receipt.projectId) || [];

    const candidates = getReceiptCandidates(
      {
        amount: receipt.receiptAmount ? Number(receipt.receiptAmount) : null,
        date: receipt.receiptDate,
        category: receipt.receiptType,
        note: receipt.merchantKeyword,
      },
      projectExpenses.map((expense) => ({
        expenseId: expense.expenseId,
        amount: Number(expense.amount),
        date: expense.date,
        category: expense.category,
        note: expense.note,
      })),
      rules
    );

    const expenseById = new Map(
      projectExpenses.map((expense) => [expense.expenseId, expense])
    );

    const responseCandidates =
      candidates.length > 0
        ? candidates.map((candidate: any) => {
          const expense = expenseById.get(candidate.expenseId);
          return {
            ...candidate,
            note: expense?.note ?? null,
            amount: expense ? Number(expense.amount) : null,
            date: expense?.date ?? null,
            status: expense?.status ?? null,
          };
        })
        : projectExpenses.map((expense) => ({
          expenseId: expense.expenseId,
          confidence: "high" as const,
          reason: "manual selection",
          note: expense.note,
          amount: Number(expense.amount),
          date: expense.date,
          status: expense.status,
        }));

    // 添加已匹配的费用
    if (
      matchedExpense &&
      !responseCandidates.some((item) => item.expenseId === matchedExpense.expenseId)
    ) {
      responseCandidates.unshift({
        expenseId: matchedExpense.expenseId,
        confidence: "high" as const,
        reason: "already matched",
        note: matchedExpense.note,
        amount: Number(matchedExpense.amount),
        date: matchedExpense.date,
        status: matchedExpense.status,
      });
    }

    result[receipt.receiptId] = responseCandidates;
  }

  console.log(`[receipts] 批量计算${receiptsData.length}个候选耗时: ${Date.now() - t1}ms`);
  console.log(`[receipts] [Handler] 业务逻辑结束, 总耗时: ${Date.now() - handlerStartTime}ms`);

  const t_serialize = Date.now();
  const response = ok(c, result);
  console.log(`[receipts] 响应序列化耗时: ${Date.now() - t_serialize}ms`);

  return response;
});

/**
 * DELETE /api/v1/receipts/:receiptId - 软删除票据
 *
 * 【软删除】
 * - 设置deletedAt字段而不是物理删除
 * - 保留审计记录
 * - 可以恢复（清空deletedAt）
 *
 * 【为什么用软删除？】
 * - 数据安全：防止误删
 * - 审计需求：保留操作历史
 * - 关联数据：不破坏外键关系
 */
router.delete("/receipts/:receiptId", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  // 软删除：设置deletedAt时间戳
  const [receipt] = await db
    .update(receipts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)))
    .returning();

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  return ok(c, { success: true });
});

/**
 * POST /api/v1/receipts/:receiptId/download-url - 获取下载URL
 *
 * 【业务场景】
 * - 用户点击下载按钮
 * - 生成临时的S3预签名下载URL
 * - 记录下载日志（审计）
 *
 * 【为什么需要预签名URL？】
 * - S3存储桶是私有的（不允许公开访问）
 * - 预签名URL提供临时访问权限
 * - 有效期通常为1小时
 * - 防止文件被未授权下载
 */
router.post("/receipts/:receiptId/download-url", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  // 查询票据记录
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt || !receipt.storageKey) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  // 生成S3预签名下载URL
  const signedUrl = await createReceiptDownloadUrl({
    storageKey: receipt.storageKey,
  });

  // 记录下载日志（审计）
  await db.insert(downloadLogs).values({
    userId,
    fileType: "receipt",
    fileId: receipt.receiptId,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  return ok(c, { signed_url: signedUrl });
});

/**
 * 导出路由器
 */
export default router;
