/**
 * 转义CSV单元格的值，处理特殊字符
 *
 * @param value - 要转义的值（字符串、数字或null）
 * @returns 转义后的CSV单元格字符串
 *
 * @description
 * CSV转义规则（RFC 4180标准）：
 * - null值转为空字符串
 * - 包含逗号、双引号、换行符的值用双引号包裹
 * - 值内的双引号需要转义为两个双引号 ("")
 *
 * @example
 * escapeCsvValue('hello') // 'hello'
 * escapeCsvValue('hello, world') // '"hello, world"'
 * escapeCsvValue('say "hi"') // '"say ""hi"""'
 * escapeCsvValue(123) // '123'
 * escapeCsvValue(null) // ''
 */
export function escapeCsvValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  // 检查是否包含特殊字符：逗号、双引号、换行符、回车符
  if (/[",\n\r]/.test(text)) {
    // 包裹双引号，并将内部的双引号转义为两个双引号
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 将二维数组构建为CSV格式字符串
 *
 * @param rows - 二维数组，每个子数组代表一行，元素为单元格值
 * @returns CSV格式的字符串，使用 CRLF (\r\n) 作为行分隔符
 *
 * @description
 * - 每一行的单元格用逗号分隔
 * - 行与行之间用 \r\n 分隔（CSV标准）
 * - 所有值都会经过 escapeCsvValue 转义处理
 *
 * @example
 * buildCsv([
 *   ['Name', 'Age', 'City'],
 *   ['Alice', 25, 'New York'],
 *   ['Bob', null, 'Los Angeles']
 * ])
 * // 返回: 'Name,Age,City\r\nAlice,25,New York\r\nBob,,Los Angeles'
 */
export function buildCsv(rows: Array<Array<string | number | null>>): string {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
}

/**
 * 在字符串开头添加UTF-8 BOM（Byte Order Mark）
 *
 * @param content - 原始字符串内容
 * @returns 添加了BOM的字符串
 *
 * @description
 * UTF-8 BOM (\uFEFF) 用于标识文件编码为UTF-8：
 * - Excel等软件需要BOM才能正确识别UTF-8编码的CSV文件
 * - 特别是包含中文等非ASCII字符时，BOM可以避免乱码
 * - BOM字符在UTF-8中的字节序列是 EF BB BF
 *
 * @example
 * withUtf8Bom('姓名,年龄\n张三,25')
 * // 返回带BOM的字符串，Excel可以正确识别中文
 */
export function withUtf8Bom(content: string): string {
  return `\uFEFF${content}`;
}
