/**
 * 队列名称常量
 * 定义系统中使用的后台任务队列
 *
 * @description
 * 系统使用消息队列（如Bull/BullMQ）处理异步任务：
 * - batch_check: 批次验证队列，检查批次中的数据完整性和问题
 * - export: 导出队列，生成CSV/ZIP/PDF导出文件
 */
export const QUEUE_NAMES = {

  /** 批次验证队列 - 批量检查费用和票据的数据质量 */
  batchCheck: "batch_check",
  /** 导出队列 - 生成报销报表和文件包 */
  export: "export"
} as const;

/**
 * 队列名称类型
 * 从 QUEUE_NAMES 常量中提取的类型，确保类型安全
 */
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
