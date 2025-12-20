// Primary money extractor that prefers lines containing explicit amount keywords.
const amountRegex =
  /(?:total|amount|payable|¥|￥|合计|金额|价税合计)\s*[:：]?\s*([\d.,]{1,15})(?:\s*元)?/i;
// Fallback matcher for bare numeric patterns when no keyword is present.
const fallbackAmountRegex = /([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/;
// Supports both YYYY-MM-DD and DD/MM/YYYY variants with CN separators.
const dateRegex =
  /(20\d{2}|19\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?|(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|19\d{2})/;

export type ClientOcrResult = {
  amount?: string;
  date?: string;
  merchant?: string;
  rawText: string;
};

function normalizeNumber(input?: string | null): string | undefined {
  if (!input) return undefined;
  const cleaned = input.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return undefined;
  return parsed.toFixed(2);
}

function normalizeDate(match: RegExpExecArray | null): string | undefined {
  if (!match) return undefined;
  const [_, y1, m1, d1, d2, m2, y2] = match;
  const year = y1 || y2;
  const month = m1 || m2;
  const day = d1 || d2;
  if (!year || !month || !day) return undefined;
  const yyyy = year.padStart(4, "0");
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickMerchant(lines: string[]): string | undefined {
  const candidates = lines
    .map((line: string) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 40)
    .filter((line) => !/^\d+$/.test(line))
    .filter(
      (line) =>
        !/(total|amount|日期|票据|发票|合计|小计|receipt|invoice)/i.test(line)
    );

  return candidates.sort((a, b) => b.length - a.length)[0];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildTextFromResult(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const ocrResults = (result as any).ocrResults;
  if (!Array.isArray(ocrResults) || ocrResults.length === 0) return "";
  const pruned = ocrResults
    .map((item: any) => item?.prunedResult)
    .filter(Boolean);
  if (pruned.length === 0) return "";
  if (typeof pruned[0] === "string") {
    return pruned.join("\n");
  }
  if (Array.isArray(pruned[0])) {
    return (pruned[0] as any[])
      .map((row) => {
        if (typeof row === "string") return row;
        if (Array.isArray(row)) return row.join(" ");
        if (row && typeof row === "object" && "text" in row)
          return (row as any).text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(pruned[0]);
}

type RunClientOcrOptions = { fileType?: 0 | 1 };

export async function runClientOcr(
  blob: Blob,
  options?: RunClientOcrOptions
): Promise<ClientOcrResult> {
  const apiUrl = process.env.NEXT_PUBLIC_BAIDU_OCR_URL;
  const token = process.env.NEXT_PUBLIC_BAIDU_OCR_TOKEN;
  if (!apiUrl || !token) {
    throw new Error("缺少 OCR 配置（NEXT_PUBLIC_BAIDU_OCR_URL / TOKEN）");
  }

  const fileData = await blobToBase64(blob);
  console.log("[client-ocr][request]", {
    apiUrl,
    fileType: options?.fileType,
    payloadBytes: fileData.length,
  });
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: fileData,
      file_type: options?.fileType ?? 1,
    }),
  });
  console.log("[client-ocr][response][status]", response.status);

  if (!response.ok) {
    throw new Error(`OCR 请求失败: ${response.status}`);
  }
  const payload = await response.json();
  if (payload.errorCode && payload.errorCode !== 0) {
    throw new Error(payload.errorMsg || "OCR 调用失败");
  }

  const text = buildTextFromResult(payload.result);
  const lines = text
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean);

  const amountMatch =
    text.match(amountRegex) || text.match(fallbackAmountRegex);
  const amount = normalizeNumber(amountMatch?.[1]);

  const date = normalizeDate(dateRegex.exec(text));
  const merchant = pickMerchant(lines);

  return {
    amount,
    date,
    merchant,
    rawText: text,
  };
}
