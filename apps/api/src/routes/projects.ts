/**
 * 项目管理路由模块
 *
 * 【Java 对比 - 类似 Spring MVC Controller】
 *
 * 本文件等同于 Spring 的 REST 控制器：
 * ```java
 * @RestController
 * @RequestMapping("/api/v1/projects")
 * @PreAuthorize("isAuthenticated()")
 * public class ProjectController {
 *     @Autowired
 *     private ProjectService projectService;
 *
 *     @GetMapping
 *     public ResponseEntity<?> getProjects(
 *         @RequestParam(required = false) String search,
 *         @RequestParam(required = false) Boolean pinned
 *     ) { ... }
 *
 *     @PostMapping
 *     public ResponseEntity<?> createProject(@Valid @RequestBody ProjectDto dto) { ... }
 *
 *     @PatchMapping("/{projectId}")
 *     public ResponseEntity<?> updateProject(
 *         @PathVariable String projectId,
 *         @Valid @RequestBody ProjectUpdateDto dto
 *     ) { ... }
 * }
 * ```
 *
 * 【路由列表】
 * 1. GET / - 获取项目列表（支持搜索、过滤、排序）
 * 2. POST / - 创建新项目
 * 3. PATCH /:projectId - 更新项目信息
 * 4. POST /:projectId/archive - 归档项目
 * 5. DELETE /:projectId - 删除项目（需检查无关联数据）
 *
 * 【业务规则】
 * - 所有操作都需要认证（authMiddleware）
 * - 用户只能操作自己的项目（userId 过滤）
 * - 归档项目不会被删除，可以恢复
 * - 删除项目前必须先删除关联的费用、票据和导出批次
 * - 项目名称不能为空
 */

import { Hono } from "hono";
import { z } from "zod"; // Zod 验证库
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm"; // Drizzle ORM 查询构建器
import { projects, receipts, expenses, batches } from "../db/index.js";
import { db } from "../db/client.js";
import { errorResponse, ok } from "../utils/http.js";

/**
 * 创建项目路由器
 *
 * 【路由挂载】这个路由器会被挂载到 /api/v1/projects
 * - 路由内部定义 "/" → 实际路径 /api/v1/projects
 * - 路由内部定义 "/:projectId" → 实际路径 /api/v1/projects/:projectId
 */
const router = new Hono();

/**
 * 创建项目请求验证规则
 *
 * 【Zod 验证】类似 Java Bean Validation：
 * ```java
 * public class ProjectCreateDto {
 *     @NotBlank
 *     private String name;
 *
 *     private String description; // 可选
 *
 *     private Boolean pinned = false; // 默认不置顶
 *
 *     private List<String> tags = new ArrayList<>(); // 默认空数组
 * }
 * ```
 *
 * 【验证规则】
 * - name: 必填，去除首尾空格，最少1个字符
 * - description: 可选，去除首尾空格
 * - pinned: 可选，布尔值（是否置顶）
 * - tags: 可选，字符串数组（项目标签）
 */
const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "name_required"),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * 更新项目请求验证规则
 *
 * 【与创建的区别】
 * - 所有字段都是可选的（PATCH 请求只更新提供的字段）
 * - 增加了 archived 字段（是否归档）
 *
 * 【Java 对比】类似：
 * ```java
 * public class ProjectUpdateDto {
 *     private Optional<String> name;
 *     private Optional<String> description;
 *     private Optional<Boolean> pinned;
 *     private Optional<Boolean> archived;
 *     private Optional<List<String>> tags;
 * }
 * ```
 */
const projectUpdateSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/projects - 获取项目列表
 *
 * 【Java 对比】类似：
 * ```java
 * @GetMapping
 * public ResponseEntity<?> getProjects(
 *     @RequestParam(required = false) String search,
 *     @RequestParam(required = false) Boolean pinned,
 *     @RequestParam(required = false) Boolean archived,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     // 构建查询条件
 *     Specification<Project> spec = Specification.where(
 *         ProjectSpecs.belongsToUser(userId)
 *     );
 *     if (archived == null) {
 *         spec = spec.and(ProjectSpecs.isNotArchived());
 *     } else {
 *         spec = spec.and(ProjectSpecs.archivedEquals(archived));
 *     }
 *     if (search != null) {
 *         spec = spec.and(ProjectSpecs.searchByKeyword(search));
 *     }
 *
 *     // 查询项目并关联统计票据数量
 *     List<ProjectWithReceiptCount> projects = projectRepository.findAll(spec);
 *     return ResponseEntity.ok(projects);
 * }
 * ```
 *
 * 【查询参数】
 * - search: 搜索关键词（在项目名称和描述中查找）
 * - pinned: 是否置顶（true/false）
 * - archived: 是否归档（undefined=仅活跃项目, true=归档项目, false=活跃项目）
 *
 * 【查询流程】
 * 1. 获取当前用户 ID
 * 2. 读取查询参数
 * 3. 构建动态过滤条件
 * 4. 使用 LEFT JOIN 关联统计票据数量
 * 5. 按置顶和更新时间排序
 * 6. 返回项目列表（包含票据数量）
 *
 * 【性能优化】
 * - 使用子查询预先统计每个项目的票据数量
 * - LEFT JOIN 连接票据统计结果
 * - 避免了 N+1 查询问题
 * - 添加性能日志，便于排查慢查询
 *
 * 【排序规则】
 * - 优先级1: 置顶项目在前
 * - 优先级2: 最近更新的在前
 */
router.get("/", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");

  // 读取查询参数
  // c.req.query() - 获取查询字符串参数，类似 @RequestParam
  const search = c.req.query("search");
  const pinned = c.req.query("pinned");
  const archived = c.req.query("archived");

  // 构建动态过滤条件数组
  // 【类型注解】SQL<unknown>[] - Drizzle SQL 表达式数组
  const filters: SQL<unknown>[] = [eq(projects.userId, userId)];

  // 处理归档状态过滤
  if (archived === undefined) {
    // 【默认行为】不传 archived 参数时，只显示未归档的项目
    filters.push(eq(projects.archived, false));
  } else {
    // 显式指定归档状态：archived=true 或 archived=false
    // archived === "true" - 查询参数都是字符串，需要比较字符串
    filters.push(eq(projects.archived, archived === "true"));
  }

  // 处理置顶状态过滤
  if (pinned !== undefined) {
    filters.push(eq(projects.pinned, pinned === "true"));
  }

  // 处理搜索关键词
  if (search) {
    const term = `%${search}%`; // SQL LIKE 模式：%keyword%

    // 【ilike】不区分大小写的 LIKE 查询（PostgreSQL 特有）
    // 【or】组合多个条件：name LIKE ? OR description LIKE ?
    // 类似 JPA: @Query("WHERE name ILIKE ?1 OR description ILIKE ?1")
    const searchFilter = or(ilike(projects.name, term), ilike(projects.description, term));
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  // 创建票据统计子查询
  // 【目的】统计每个项目的票据数量（排除软删除的票据）
  // 【Java 对比】类似：
  // SELECT project_id, COUNT(*) as receipt_count
  // FROM receipts
  // WHERE user_id = ? AND deleted_at IS NULL
  // GROUP BY project_id
  const receiptCounts = db
    .select({
      projectId: receipts.projectId,
      // sql<number> - SQL 原生表达式，指定返回类型为 number
      receiptCount: sql<number>`count(*)`.as("receiptCount"),
    })
    .from(receipts)
    .where(and(eq(receipts.userId, userId), isNull(receipts.deletedAt)))
    .groupBy(receipts.projectId)
    .as("receipt_counts"); // .as() - 将子查询命名为 receipt_counts

  // 执行主查询
  const t1 = Date.now();
  const data = await db
    .select({
      // 选择项目的所有字段
      projectId: projects.projectId,
      userId: projects.userId,
      name: projects.name,
      description: projects.description,
      pinned: projects.pinned,
      archived: projects.archived,
      tags: projects.tags,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      // 票据数量（如果没有票据，使用 0）
      // coalesce(value, default) - SQL 函数，类似 Java 的 Optional.orElse()
      receiptCount: sql<number>`coalesce(${receiptCounts.receiptCount}, 0)`.as(
        "receiptCount"
      ),
    })
    .from(projects)
    // 【LEFT JOIN】左连接票据统计
    // 即使项目没有票据，也会返回项目（receiptCount 为 0）
    .leftJoin(receiptCounts, eq(receiptCounts.projectId, projects.projectId))
    // 【过滤条件】
    // and(...filters) - 将所有过滤条件用 AND 连接
    // sql`nullif(${projects.name}, '') is not null` - 排除空名称项目（无效草稿）
    .where(and(...filters, sql`nullif(${projects.name}, '') is not null`))
    // 【排序】
    // desc() - 降序排列
    // 优先级1: pinned（置顶在前）
    // 优先级2: updatedAt（最近更新在前）
    .orderBy(desc(projects.pinned), desc(projects.updatedAt));

  // 性能日志
  console.log(`[projects] [DB] 查询项目列表耗时: ${Date.now() - t1}ms - 返回 ${data.length} 条, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, data);
});

/**
 * POST /api/v1/projects - 创建新项目
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping
 * public ResponseEntity<?> createProject(
 *     @Valid @RequestBody ProjectCreateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Project project = new Project();
 *     project.setUserId(userId);
 *     project.setName(dto.getName());
 *     project.setDescription(dto.getDescription());
 *     project.setPinned(dto.getPinned() != null ? dto.getPinned() : false);
 *     project.setTags(dto.getTags() != null ? dto.getTags() : new ArrayList<>());
 *
 *     projectRepository.save(project);
 *     return ResponseEntity.ok(project);
 * }
 * ```
 *
 * 【处理流程】
 * 1. 验证请求体
 * 2. 插入项目到数据库
 * 3. 返回新创建的项目
 *
 * 【字段默认值】
 * - pinned: 未提供时默认 false（不置顶）
 * - tags: 未提供时默认 []（空数组）
 *
 * 【空值合并运算符 ??】
 * - body.data.pinned ?? false - 如果 pinned 为 null 或 undefined，使用 false
 * - 类似 Java: Optional.ofNullable(pinned).orElse(false)
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 */
router.post("/", async (c) => {
  const { userId } = c.get("auth");

  // 验证请求体
  const body = projectCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 插入项目
  const t1 = Date.now();
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: body.data.name,
      description: body.data.description,
      pinned: body.data.pinned ?? false, // 未提供时默认 false
      tags: body.data.tags ?? [], // 未提供时默认空数组
    })
    .returning(); // 返回插入的记录（PostgreSQL 特性）

  console.log(`[projects] [DB] 创建项目耗时: ${Date.now() - t1}ms`);

  return ok(c, project);
});

/**
 * PATCH /api/v1/projects/:projectId - 更新项目信息
 *
 * 【Java 对比】类似：
 * ```java
 * @PatchMapping("/{projectId}")
 * public ResponseEntity<?> updateProject(
 *     @PathVariable String projectId,
 *     @Valid @RequestBody ProjectUpdateDto dto,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Project project = projectRepository.findById(projectId)
 *         .orElseThrow(() -> new NotFoundException("Project not found"));
 *
 *     // 验证权限
 *     if (!project.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     // 只更新提供的字段
 *     if (dto.getName() != null) project.setName(dto.getName());
 *     if (dto.getDescription() != null) project.setDescription(dto.getDescription());
 *     if (dto.getPinned() != null) project.setPinned(dto.getPinned());
 *     project.setUpdatedAt(new Date());
 *
 *     projectRepository.save(project);
 *     return ResponseEntity.ok(project);
 * }
 * ```
 *
 * 【HTTP 方法】
 * - PATCH: 部分更新（只更新提供的字段）
 * - PUT: 完整替换（需要提供所有字段）
 * - 本项目使用 PATCH，更符合语义
 *
 * 【处理流程】
 * 1. 获取路径参数 projectId
 * 2. 验证请求体
 * 3. 更新项目（只更新提供的字段）
 * 4. 验证权限（WHERE 条件包含 userId）
 * 5. 返回更新后的项目
 *
 * 【展开运算符 ...】
 * - ...body.data - 将对象的所有属性展开
 * - 类似 Java 的 BeanUtils.copyProperties()
 * - 只复制提供的字段（未定义的字段不会被复制）
 *
 * 【权限验证】
 * - WHERE 条件包含 userId，确保用户只能更新自己的项目
 * - 如果项目不存在或不属于当前用户，返回 404
 *
 * 【错误响应】
 * - 400 INVALID_INPUT: 请求体验证失败
 * - 404 PROJECT_NOT_FOUND: 项目不存在或无权限
 */
router.patch(":projectId", async (c) => {
  const { userId } = c.get("auth");
  // c.req.param() - 获取路径参数，类似 @PathVariable
  const projectId = c.req.param("projectId");

  // 验证请求体
  const body = projectUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  // 更新项目
  // 【展开运算符】...body.data - 将对象的所有属性展开
  // 只更新提供的字段，未提供的字段保持原值
  const [project] = await db
    .update(projects)
    .set({
      ...body.data,
      updatedAt: new Date(), // 强制更新时间戳
    })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  // 验证权限和存在性
  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

/**
 * POST /api/v1/projects/:projectId/archive - 归档项目
 *
 * 【Java 对比】类似：
 * ```java
 * @PostMapping("/{projectId}/archive")
 * public ResponseEntity<?> archiveProject(
 *     @PathVariable String projectId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Project project = projectRepository.findById(projectId)
 *         .orElseThrow(() -> new NotFoundException("Project not found"));
 *
 *     if (!project.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     project.setArchived(true);
 *     project.setUpdatedAt(new Date());
 *     projectRepository.save(project);
 *
 *     return ResponseEntity.ok(project);
 * }
 * ```
 *
 * 【业务逻辑】
 * - 归档项目（设置 archived = true）
 * - 归档不是删除，可以通过更新 archived = false 恢复
 * - 归档的项目默认不会在列表中显示（除非指定 archived=true）
 *
 * 【处理流程】
 * 1. 获取项目 ID
 * 2. 更新 archived 字段为 true
 * 3. 验证权限
 * 4. 返回更新后的项目
 *
 * 【为什么使用 POST 而不是 PATCH？】
 * - 归档是一个明确的业务操作（action），不是简单的字段更新
 * - 使用 POST /archive 更符合 RESTful 语义
 * - 类似操作：POST /approve, POST /publish
 *
 * 【错误响应】
 * - 404 PROJECT_NOT_FOUND: 项目不存在或无权限
 */
router.post(":projectId/archive", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 归档项目（设置 archived = true）
  const [project] = await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

/**
 * DELETE /api/v1/projects/:projectId - 删除项目
 *
 * 【Java 对比】类似：
 * ```java
 * @DeleteMapping("/{projectId}")
 * public ResponseEntity<?> deleteProject(
 *     @PathVariable String projectId,
 *     Authentication auth
 * ) {
 *     String userId = ((JwtPayload) auth.getPrincipal()).getSub();
 *
 *     Project project = projectRepository.findById(projectId)
 *         .orElseThrow(() -> new NotFoundException("Project not found"));
 *
 *     if (!project.getUserId().equals(userId)) {
 *         throw new ForbiddenException();
 *     }
 *
 *     // 检查是否有关联数据
 *     long expenseCount = expenseRepository.countByProjectId(projectId);
 *     long receiptCount = receiptRepository.countByProjectIdAndDeletedAtIsNull(projectId);
 *     long batchCount = batchRepository.countByProjectId(projectId);
 *
 *     if (expenseCount > 0 || receiptCount > 0 || batchCount > 0) {
 *         throw new BadRequestException(
 *             "Cannot delete project with existing data"
 *         );
 *     }
 *
 *     projectRepository.delete(project);
 *     return ResponseEntity.ok(Map.of("success", true));
 * }
 * ```
 *
 * 【业务规则】
 * - 只能删除空项目（没有费用、票据、导出批次）
 * - 防止误删除导致数据丢失
 * - 如果有关联数据，必须先删除关联数据
 *
 * 【处理流程】
 * 1. 验证项目存在且属于当前用户
 * 2. 统计关联的费用、票据、导出批次数量
 * 3. 如果有任何关联数据，返回错误
 * 4. 删除项目
 *
 * 【物理删除 vs 软删除】
 * - 本接口使用物理删除（DELETE FROM projects）
 * - 票据使用软删除（设置 deletedAt）
 * - 项目是顶层实体，清空后可以安全删除
 *
 * 【性能优化】
 * - 添加详细的性能日志
 * - 分别统计三种关联数据的数量
 * - 记录每个查询的耗时，便于排查慢查询
 *
 * 【错误响应】
 * - 404 PROJECT_NOT_FOUND: 项目不存在或无权限
 * - 400 PROJECT_HAS_DATA: 项目有关联数据，无法删除
 */
router.delete(":projectId", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 1. 检查项目是否存在
  let t1 = Date.now();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)));
  console.log(`[projects] [DB] 查询项目耗时: ${Date.now() - t1}ms`);

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  // 2. 检查项目下是否有费用
  t1 = Date.now();
  const [expenseCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));
  console.log(`[projects] [DB] 查询费用数量耗时: ${Date.now() - t1}ms - ${expenseCount?.count ?? 0} 条`);

  // 3. 检查项目下是否有票据（排除软删除的）
  t1 = Date.now();
  const [receiptCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(receipts)
    .where(and(eq(receipts.projectId, projectId), isNull(receipts.deletedAt)));
  console.log(`[projects] [DB] 查询票据数量耗时: ${Date.now() - t1}ms - ${receiptCount?.count ?? 0} 张`);

  // 4. 检查项目下是否有导出批次
  t1 = Date.now();
  const [batchCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(batches)
    .where(eq(batches.projectId, projectId));
  console.log(`[projects] [DB] 查询导出数量耗时: ${Date.now() - t1}ms - ${batchCount?.count ?? 0} 个`);

  // 5. 判断是否有关联数据
  // 【空值合并】?? 0 - 如果 count 为 undefined，使用 0
  const hasData =
    (expenseCount?.count ?? 0) > 0 ||
    (receiptCount?.count ?? 0) > 0 ||
    (batchCount?.count ?? 0) > 0;

  if (hasData) {
    return errorResponse(
      c,
      400,
      "PROJECT_HAS_DATA",
      "Cannot delete project with existing data. Please delete all expenses, receipts, and exports first."
    );
  }

  // 6. 删除项目（物理删除）
  t1 = Date.now();
  await db.delete(projects).where(eq(projects.projectId, projectId));
  console.log(`[projects] [DB] 删除项目耗时: ${Date.now() - t1}ms, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, { success: true });
});

/**
 * 导出路由器
 *
 * 【模块导出】export default - 默认导出
 * - 导入时：import projectRoutes from "./routes/projects"
 * - 挂载时：app.route("/api/v1/projects", projectRoutes)
 */
export default router;
