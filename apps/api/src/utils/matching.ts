import { daysBetween, parseDate } from "./date.js";
import type { MatchRuleConfig, ReceiptCandidate } from "../domain/types.js";

/**
 * 用于匹配的费用数据结构
 */
export type ExpenseForMatch = {
  /** 费用ID */
  expenseId: string;
  /** 费用金额 */
  amount: number;
  /** 费用日期 */
  date: string | Date;
  /** 费用类别 */
  category: string | null;
  /** 费用备注 */
  note: string | null;
};

/**
 * 用于匹配的票据数据结构
 */
export type ReceiptForMatch = {
  /** 票据金额（手动输入） */
  amount: number | null;
  /** 票据日期（手动输入） */
  date: string | Date | null;
  /** 票据类别 */
  category: string | null;
  /** 票据备注 */
  note: string | null;
};

/**
 * 候选匹配结果（内部使用，包含评分）
 */
export type CandidateResult = ReceiptCandidate & {
  /** 匹配评分 - 用于排序，分数越高表示匹配度越高 */
  score: number;
};

/**
 * 获取票据的候选匹配费用列表
 *
 * @param receipt - 待关联的票据信息
 * @param expenses - 候选费用列表
 * @param rules - 匹配规则配置
 * @returns 最多返回3个匹配度最高的候选费用，按评分降序排列
 *
 * @description
 * 匹配算法流程：
 * 1. 检查票据是否包含金额或日期信息，如果都没有则返回空数组
 * 2. 遍历所有候选费用，计算每个费用与票据的匹配度
 * 3. 过滤掉不符合规则的候选（如金额差异过大）
 * 4. 按匹配评分降序排序
 * 5. 返回前3个最佳候选
 *
 * 匹配规则：
 * - 金额必须匹配（差值在容差范围内）
 * - 日期在窗口范围内（可配置）
 * - 类别匹配（可选）
 *
 * @example
 * getReceiptCandidates(
 *   { amount: 125.50, date: '2025-12-20', category: '交通', note: null },
 *   [
 *     { expenseId: '1', amount: 125.50, date: '2025-12-20', category: '交通', note: '打车' },
 *     { expenseId: '2', amount: 125.00, date: '2025-12-21', category: '交通', note: '地铁' }
 *   ],
 *   { dateWindowDays: 3, amountTolerance: 1.0, requireCategoryMatch: false }
 * )
 * // 返回按匹配度排序的候选列表
 */
export function getReceiptCandidates(
  receipt: ReceiptForMatch,
  expenses: ExpenseForMatch[],
  rules: MatchRuleConfig
): ReceiptCandidate[] {
  // 如果票据既没有金额也没有日期，无法进行匹配
  if (!receipt.amount && !receipt.date) {
    return [];
  }

  // 计算所有候选的匹配度，过滤无效候选，排序后返回前3名
  const results = expenses
    .map((expense) => buildCandidate(receipt, expense, rules))
    .filter((candidate): candidate is CandidateResult => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ expenseId, confidence, reason }) => ({
      expenseId,
      confidence,
      reason,
    }));

  return results;
}

/**
 * 构建单个候选匹配结果
 *
 * @param receipt - 票据信息
 * @param expense - 费用信息
 * @param rules - 匹配规则
 * @returns 候选匹配结果，不符合规则时返回 null
 *
 * @description
 * 匹配逻辑：
 * 1. 金额匹配：差值必须在容差范围内（必需条件）
 * 2. 日期匹配：差值必须在日期窗口内（可选条件）
 * 3. 类别匹配：类别必须相同（可选条件，取决于规则配置）
 * 4. 计算置信度和评分
 * 5. 过滤低质量匹配（日期不匹配且置信度低）
 *
 * @internal
 */
function buildCandidate(
  receipt: ReceiptForMatch,
  expense: ExpenseForMatch,
  rules: MatchRuleConfig
): CandidateResult | null {
  const receiptAmount = receipt.amount ?? null;
  const receiptDate = parseDate(receipt.date);
  const expenseDate = parseDate(expense.date);

  // 票据必须有金额，费用必须有日期
  if (!receiptAmount || !expenseDate) {
    return null;
  }

  // 检查金额匹配（必需条件）
  const amountDiff = Math.abs(expense.amount - receiptAmount);
  const amountMatch = amountDiff <= rules.amountTolerance;

  // 检查日期匹配（可选条件）
  const dateDiff = receiptDate
    ? Math.abs(daysBetween(expenseDate, receiptDate))
    : null;
  const dateMatch = dateDiff !== null && dateDiff <= rules.dateWindowDays;

  // 金额不匹配，直接排除
  if (!amountMatch) {
    return null;
  }

  // 检查类别匹配（根据规则决定是否必需）
  const categoryMatch =
    !rules.requireCategoryMatch ||
    !expense.category ||
    !receipt.category ||
    expense.category === receipt.category;

  // 计算置信度
  const confidence = getConfidence({ amountMatch, dateDiff, categoryMatch });
  // 计算评分（用于排序）
  const score = getScore({ dateDiff, categoryMatch });
  // 生成匹配原因说明
  const reason = buildReason({ dateDiff, categoryMatch });

  // 过滤低质量匹配：日期不匹配且置信度低
  if (!dateMatch && confidence === "low") {
    return null;
  }

  return {
    expenseId: expense.expenseId,
    confidence,
    reason,
    score,
  };
}

/**
 * 计算匹配置信度
 *
 * @param input - 匹配条件
 * @returns 置信度等级：high | medium | low
 *
 * @description
 * 置信度规则：
 * - high: 金额匹配 + 日期差≤1天 + 类别匹配
 * - medium: 金额匹配 + 日期差≤3天
 * - low: 金额匹配但日期差>3天或日期缺失
 *
 * @internal
 */
function getConfidence(input: {
  amountMatch: boolean;
  dateDiff: number | null;
  categoryMatch: boolean;
}): "high" | "medium" | "low" {
  const dateDiff = input.dateDiff ?? Infinity;

  // 高置信度：金额匹配 + 日期差≤1天 + 类别匹配
  if (input.amountMatch && dateDiff <= 1 && input.categoryMatch) {
    return "high";
  }
  // 中等置信度：金额匹配 + 日期差≤3天
  if (input.amountMatch && dateDiff <= 3) {
    return "medium";
  }
  // 低置信度：其他情况
  return "low";
}

/**
 * 计算匹配评分（用于排序）
 *
 * @param input - 匹配条件
 * @returns 评分，分数越高表示匹配度越高
 *
 * @description
 * 评分规则：
 * - 日期权重：10分 - 日期差值（日期越近分数越高，最多10分）
 * - 类别权重：类别匹配+2分
 * - 总分：0-12分
 *
 * @internal
 */
function getScore(input: {
  dateDiff: number | null;
  categoryMatch: boolean;
}): number {
  // 日期评分：日期越近分数越高，最多10分
  const dateWeight =
    input.dateDiff === null ? 0 : Math.max(0, 10 - input.dateDiff);
  // 类别评分：匹配+2分
  const categoryWeight = input.categoryMatch ? 2 : 0;
  return dateWeight + categoryWeight;
}

/**
 * 构建匹配原因说明文本
 *
 * @param input - 匹配条件
 * @returns 原因说明字符串
 *
 * @description
 * 生成人类可读的匹配原因说明，如：
 * - "date+/-1d + category" - 日期差1天且类别匹配
 * - "date+/-3d" - 日期差3天
 * - "amount" - 仅金额匹配
 *
 * @internal
 */
function buildReason(input: {
  dateDiff: number | null;
  categoryMatch: boolean;
}): string {
  const segments = [] as string[];

  // 添加日期差异说明
  if (input.dateDiff !== null) {
    segments.push(`date+/-${input.dateDiff}d`);
  }
  // 添加类别匹配说明
  if (input.categoryMatch) {
    segments.push("category");
  }

  // 拼接原因，如果没有其他条件则返回"amount"（表示仅金额匹配）
  return segments.join(" + ") || "amount";
}
