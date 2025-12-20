declare module "tesseract.js" {
  export function recognize(
    image: Blob | string,
    lang?: string,
    options?: Record<string, unknown>
  ): Promise<{
    data: { text: string };
  }>;
}
