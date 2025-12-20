import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config";

const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: config.s3Region,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey
  },
  forcePathStyle: true
});

export async function downloadObject(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: storageKey
  });
  const response = await s3.send(command);
  if (!response.Body) {
    throw new Error("Missing object body");
  }
  return streamToBuffer(response.Body as NodeJS.ReadableStream);
}

export async function uploadObject(input: {
  storageKey: string;
  body: Buffer;
  contentType: string;
}): Promise<{ publicUrl: string; size: number }> {
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType
  });
  await s3.send(command);
  return {
    publicUrl: `${config.s3PublicBaseUrl}/${input.storageKey}`,
    size: input.body.length
  };
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
