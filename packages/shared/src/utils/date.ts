/**
 * 将Date对象格式化为 YYYY-MM-DD 字符串
 *
 * @param value - 要格式化的Date对象
 * @returns 格式化后的日期字符串，如 "2025-12-20"
 *
 * @example
 * formatDate(new Date('2025-12-20T10:30:00Z')) // "2025-12-20"
 */
export function formatDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 解析日期字符串或Date对象，返回Date对象
 *
 * @param value - 日期字符串、Date对象或null
 * @returns 解析后的Date对象，解析失败或输入为null时返回null
 *
 * @example
 * parseDate('2025-12-20') // Date对象
 * parseDate(new Date()) // 返回原Date对象
 * parseDate('invalid') // null
 * parseDate(null) // null
 */
export function parseDate(value: string | Date | null): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * 计算两个日期之间相差的天数（绝对值）
 *
 * @param a - 第一个日期
 * @param b - 第二个日期
 * @returns 相差的天数，使用UTC时间计算，忽略时分秒
 *
 * @description
 * - 使用UTC时间计算，避免时区和夏令时问题
 * - 只计算日期部分，忽略具体时间
 * - 返回值四舍五入到整数天数
 *
 * @example
 * daysBetween(new Date('2025-12-20'), new Date('2025-12-25')) // 5
 * daysBetween(new Date('2025-12-25'), new Date('2025-12-20')) // -5
 */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((end - start) / msPerDay);
}
