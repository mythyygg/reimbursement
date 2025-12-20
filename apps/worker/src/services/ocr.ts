import { config } from "../config";
import { downloadObject } from "./storage";

export type OcrResult = {
  amount?: number;
  date?: string;
  merchantKeyword?: string;
  confidence?: number;
  source: string;
};

export type OcrProvider = {
  name: string;
  extract: (input: {
    fileUrl?: string;
    storageKey?: string;
  }) => Promise<OcrResult | null>;
};

const noopProvider: OcrProvider = {
  name: "none",
  extract: async () => null,
};

function getBaiduEnv() {
  const apiUrl = process.env.BAIDU_OCR_URL;
  const token = process.env.BAIDU_OCR_TOKEN;
  return { apiUrl, token };
}

async function loadFileBase64(input: {
  storageKey?: string;
  fileUrl?: string;
}) {
  if (input.storageKey) {
    const buffer = await downloadObject(input.storageKey!);
    return buffer.toString("base64");
  }
  if (input.fileUrl) {
    const res = await fetch(input.fileUrl);
    if (!res.ok) throw new Error(`fetch file failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.toString("base64");
  }
  throw new Error("no file to OCR");
}

const providers: Record<string, OcrProvider> = {
  none: noopProvider,
  tencent: { name: "tencent", extract: async () => null },
  aliyun: { name: "aliyun", extract: async () => null },
  baidu: {
    name: "baidu",
    extract: async ({ fileUrl, storageKey }) => {
      const { apiUrl, token } = getBaiduEnv();
      if (!apiUrl || !token) {
        console.warn(
          "[ocr][baidu][skip] missing BAIDU_OCR_URL or BAIDU_OCR_TOKEN"
        );
        return null;
      }
      try {
        const imageBase64 = await loadFileBase64({ fileUrl, storageKey });
        console.log("[ocr][baidu][request]", {
          storageKey,
          fileUrl,
          bytes: imageBase64.length,
        });
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: imageBase64,
            file_type: fileUrl?.toLowerCase().endsWith(".pdf") ? 0 : 1,
          }),
        });
        console.log("[ocr][baidu][status]", response.status);
        if (!response.ok) {
          console.warn("[ocr][baidu][fail]", { status: response.status });
          return null;
        }
        const data = await response.json();
        console.log("[ocr][baidu][response]", data);
        // 简单回填源信息，金额/日期若有可后续解析。
        return {
          source: "baidu",
          amount: undefined,
          date: undefined,
          merchantKeyword: undefined,
          confidence: undefined,
        };
      } catch (error) {
        console.warn("[ocr][baidu][error]", {
          storageKey,
          fileUrl,
          error,
        });
        return null;
      }
    },
  },
  huawei: { name: "huawei", extract: async () => null },
};

export function getProviderPreference(): string[] {
  try {
    const parsed = JSON.parse(config.ocrProvidersJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    return [config.ocrProvider];
  }
  return [config.ocrProvider];
}

export async function runOcr(input: {
  storageKey?: string;
  fileUrl?: string;
  preference: string[];
}): Promise<OcrResult | null> {
  console.log("[ocr][run]", {
    storageKey: input.storageKey,
    fileUrl: input.fileUrl,
    preference: input.preference,
  });
  const preference = input.preference.length > 0 ? input.preference : ["none"];
  for (const name of preference) {
    const provider = providers[name] ?? providers.none;
    console.log("[ocr][try]", {
      provider: provider.name,
      storageKey: input.storageKey,
    });
    const result = await provider.extract({
      storageKey: input.storageKey,
      fileUrl: input.fileUrl,
    });
    if (result) {
      console.log("[ocr][success]", {
        provider: provider.name,
        source: result.source,
        amount: result.amount,
        date: result.date,
        confidence: result.confidence,
      });
      return result;
    }
    console.log("[ocr][empty]", { provider: provider.name });
  }
  console.warn("[ocr][all_providers_failed]", { preference });
  return null;
}
