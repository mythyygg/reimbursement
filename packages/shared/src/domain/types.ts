/**
 * 费用状态枚举
 * 表示报销单的处理状态
 */
export type ExpenseStatus =
  /** 新建 - 报销单已创建，待处理 */
  | "pending"
  /** 处理中 - 报销单正在处理，已关联票据或正在审核 */
  | "processing"
  /** 已报销 - 报销单已完成，费用已发放 */
  | "completed";

/**
 * 票据上传状态枚举
 * 跟踪票据文件的上传进度
 */
export type ReceiptUploadStatus =
  /** 待上传 - 票据记录已创建，但文件尚未上传 */
  | "pending"
  /** 已上传 - 文件已成功上传到对象存储 */
  | "uploaded"
  /** 上传失败 - 文件上传过程中出现错误 */
  | "failed";



/**
 * 导出状态枚举
 * 跟踪导出任务的执行状态
 */
export type ExportStatus =
  /** 待处理 - 导出任务已创建，等待执行 */
  | "pending"
  /** 执行中 - 导出任务正在生成文件 */
  | "running"
  /** 已完成 - 导出文件生成成功，可以下载 */
  | "done"
  /** 失败 - 导出过程中发生错误 */
  | "failed";

/**
 * 导出类型枚举
 * 定义支持的导出文件格式
 */
export type ExportType =
  /** CSV格式 - 费用明细表格 */
  | "csv"
  /** ZIP压缩包 - 包含CSV和所有票据图片 */
  | "zip"
  /** PDF文档 - 费用明细和票据图片的PDF报告 */
  | "pdf";

/**
 * 匹配置信度枚举
 * 表示票据与费用自动匹配的可信程度
 */
export type MatchConfidence =
  /** 高置信度 - 金额、日期、类别都匹配，可自动关联 */
  | "high"
  /** 中等置信度 - 金额和日期基本匹配，建议用户确认 */
  | "medium"
  /** 低置信度 - 仅部分信息匹配，需要用户手动确认 */
  | "low";

/**
 * 批次问题类型枚举
 * 定义批次验证时可能发现的问题类型
 */
export type BatchIssueType =
  /** 缺少票据 - 费用未关联票据 */
  | "missing_receipt"
  /** 重复票据 - 同一张票据被多次使用 */
  | "duplicate_receipt"
  /** 金额不匹配 - 费用金额与票据金额不一致 */
  | "amount_mismatch";

/**
 * 排序方向枚举
 * 定义列表排序的方向
 */
export type SortDirection =
  /** 升序 - 从小到大、从旧到新 */
  | "asc"
  /** 降序 - 从大到小、从新到旧 */
  | "desc";

/**
 * 票据候选匹配结果
 * 表示一张票据可能匹配的费用记录
 */
export type ReceiptCandidate = {
  /** 候选费用的ID */
  expenseId: string;
  /** 匹配置信度 - high | medium | low */
  confidence: MatchConfidence;
  /** 匹配原因说明 - 如 "date+/-1d + category" 表示日期相差1天且类别匹配 */
  reason: string;
};

/**
 * 匹配规则配置
 * 定义票据与费用自动匹配的规则参数
 */
export type MatchRuleConfig = {
  /** 日期窗口天数 - 票据日期与费用日期的最大允许差值（天） */
  dateWindowDays: number;
  /** 金额容差 - 票据金额与费用金额的最大允许差值 */
  amountTolerance: number;
  /** 是否要求类别匹配 - true表示只有类别相同才能匹配 */
  requireCategoryMatch: boolean;
};

/**
 * 导出模板配置
 * 定义导出文件的格式和包含的内容
 */
export type ExportTemplateConfig = {
  /** 是否包含商户关键词 */
  includeMerchantKeyword: boolean;
  /** 是否包含费用ID */
  includeExpenseId: boolean;
  /** 是否包含票据ID列表 */
  includeReceiptIds: boolean;
  /** 排序方向 - 按日期或金额排序的方向 */
  sortDirection: SortDirection;
  /** 是否包含PDF格式 - 在ZIP导出时是否同时生成PDF */
  includePdf: boolean;
};
