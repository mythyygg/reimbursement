import { formatDate, parseDate } from "./date.js";

/**
 * 导出文件命名所需的输入参数
 */
export type ExportNameInput = {
  /** 序号 - 用于排序，会补零到3位 */
  sequence: number;
  /** 费用日期 - Date对象或日期字符串 */
  date: string | Date;
  /** 费用金额 */
  amount: number;
  /** 费用类别 - 如交通、餐饮等 */
  category: string | null;
  /** 费用备注 */
  note: string | null;
  /** 票据ID - 用于生成短ID后缀 */
  receiptId: string;
  /** 文件扩展名 - 如 jpg、png、pdf */
  extension: string;
  /** 子序号 - 同一费用多张票据时的子编号，转换为字母后缀 */
  subIndex?: number;
};

/**
 * 构建票据文件的标准化文件名
 *
 * @param input - 文件命名所需的参数
 * @returns 格式化的文件名，格式: {seq}{suffix}_{date}_{amount}_{category}_{note}_{idShort}.{ext}
 *
 * @description
 * 文件命名规则：
 * - 序号：补零到3位，如 001、002、123
 * - 子序号：转换为字母后缀，如 a、b、c...，用于同一费用的多张票据
 * - 日期：YYYY-MM-DD 格式
 * - 金额：保留两位小数
 * - 类别：清理特殊字符，空值用"其他"代替
 * - 备注：截断并清理特殊字符，默认最长20字符
 * - ID短码：取票据ID的后6位
 * - 文件名超过120字符时，备注会缩短到10字符
 *
 * @example
 * buildReceiptFilename({
 *   sequence: 5,
 *   date: '2025-12-20',
 *   amount: 125.50,
 *   category: '交通',
 *   note: '打车费用',
 *   receiptId: 'abc123def456',
 *   extension: 'jpg'
 * })
 * // 返回: '005_2025-12-20_125.50_交通_打车费用_ef456.jpg'
 */
export function buildReceiptFilename(input: ExportNameInput): string {
  // 序号补零到3位
  const seq = String(input.sequence).padStart(3, "0");
  // 子序号转换为字母后缀（a, b, c...）
  const suffix = input.subIndex !== undefined ? toSubIndex(input.subIndex) : "";
  // 格式化日期
  const date = formatDate(parseDate(input.date) ?? new Date());
  // 格式化金额（两位小数）
  const amount = formatAmount(input.amount);
  // 清理类别名称，空值用"其他"代替
  const category = sanitizeSegment(input.category || "其他");
  // 清理并截断备注
  const rawNote = input.note || "-";
  let note = sanitizeSegment(truncateNote(rawNote, 20));
  // 取ID后6位作为短ID
  const idShort = shortId(input.receiptId);
  // 清理文件扩展名
  const ext = sanitizeExtension(input.extension);

  // 拼接文件名
  let filename = `${seq}${suffix}_${date}_${amount}_${category}_${note}_${idShort}.${ext}`;

  // 如果文件名超过120字符，缩短备注到10字符
  if (filename.length > 120) {
    note = sanitizeSegment(truncateNote(rawNote, 10));
    filename = `${seq}${suffix}_${date}_${amount}_${category}_${note}_${idShort}.${ext}`;
  }
  return filename;
}

/**
 * 格式化金额为两位小数的字符串
 *
 * @param value - 金额数值
 * @returns 格式化后的金额字符串，保留两位小数
 *
 * @example
 * formatAmount(125.5) // '125.50'
 * formatAmount(100) // '100.00'
 */
export function formatAmount(value: number): string {
  return value.toFixed(2);
}

/**
 * 清理文件名片段，移除特殊字符
 *
 * @param value - 要清理的字符串
 * @returns 清理后的字符串，特殊字符被替换为下划线
 *
 * @description
 * - 去除首尾空格
 * - 保留字母、数字、中文和空格
 * - 其他字符替换为下划线
 * - 空字符串返回 "-"
 *
 * @example
 * sanitizeSegment('交通-打车') // '交通_打车'
 * sanitizeSegment('Taxi & Uber') // 'Taxi___Uber'
 * sanitizeSegment('') // '-'
 */
export function sanitizeSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }
  // 保留字母、数字、中文（\u4e00-\u9fa5）和空格，其他字符替换为下划线
  return trimmed.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, "_");
}

/**
 * 截断字符串到指定长度
 *
 * @param value - 要截断的字符串
 * @param maxLength - 最大长度
 * @returns 截断后的字符串
 *
 * @example
 * truncateNote('这是一段很长的备注信息', 10) // '这是一段很长的备注信息' (如果不超过10字符)
 * truncateNote('This is a very long note', 10) // 'This is a '
 */
export function truncateNote(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

/**
 * 获取ID的短格式（后6位）
 *
 * @param value - 完整的ID字符串
 * @returns ID的后6位，不足6位则返回原字符串
 *
 * @example
 * shortId('abc123def456') // 'ef456'
 * shortId('short') // 'short'
 */
export function shortId(value: string): string {
  if (value.length <= 6) {
    return value;
  }
  return value.slice(-6);
}

/**
 * 清理文件扩展名，只保留字母和数字
 *
 * @param value - 原始扩展名
 * @returns 清理后的扩展名，无效时返回 "bin"
 *
 * @example
 * sanitizeExtension('jpg') // 'jpg'
 * sanitizeExtension('.png') // 'png'
 * sanitizeExtension('???') // 'bin'
 */
export function sanitizeExtension(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned || "bin";
}

/**
 * 将数字索引转换为字母标识（a, b, c, ..., z, aa, ab, ...）
 *
 * @param index - 数字索引（从0开始）
 * @returns 对应的字母标识
 *
 * @description
 * 用于同一费用的多张票据编号：
 * - 0 -> 'a', 1 -> 'b', ..., 25 -> 'z'
 * - 26 -> 'aa', 27 -> 'ab', ..., 51 -> 'az'
 * - 52 -> 'ba', ...
 *
 * @example
 * toSubIndex(0) // 'a'
 * toSubIndex(1) // 'b'
 * toSubIndex(25) // 'z'
 * toSubIndex(26) // 'aa'
 * toSubIndex(27) // 'ab'
 */
export function toSubIndex(index: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  if (index < alphabet.length) {
    return alphabet[index];
  }
  // 超过26个时，使用两个字母：aa, ab, ac...
  const first = Math.floor(index / alphabet.length) - 1;
  const second = index % alphabet.length;
  return `${alphabet[first] || "a"}${alphabet[second]}`;
}
