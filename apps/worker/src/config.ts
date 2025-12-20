export type AppConfig = {
  databaseUrl: string;
  redisUrl: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
  s3PublicBaseUrl: string;
  ocrProvider: string;
  ocrProvidersJson: string;
};

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const config: AppConfig = {
  databaseUrl: getEnv("DATABASE_URL"),
  redisUrl: getEnv("REDIS_URL", "redis://localhost:6379"),
  s3Endpoint: getEnv("S3_ENDPOINT"),
  s3Region: getEnv("S3_REGION", "us-east-1"),
  s3AccessKey: getEnv("S3_ACCESS_KEY"),
  s3SecretKey: getEnv("S3_SECRET_KEY"),
  s3Bucket: getEnv("S3_BUCKET"),
  s3PublicBaseUrl: getEnv("S3_PUBLIC_BASE_URL", ""),
  ocrProvider: getEnv("OCR_PROVIDER", "none"),
  ocrProvidersJson: getEnv("OCR_PROVIDERS_JSON", "[]"),
};
