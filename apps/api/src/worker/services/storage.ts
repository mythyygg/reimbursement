import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "../../config.js";

const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: config.s3Region,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey,
  },
  forcePathStyle: true,
});

export async function downloadObject(storageKey: string): Promise<Buffer> {
  const startTime = Date.now();
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: storageKey,
  });

  const requestStartTime = Date.now();
  const response = await s3.send(command);
  const requestTime = Date.now() - requestStartTime;

  if (!response.Body) {
    throw new Error("Missing object body");
  }

  const streamStartTime = Date.now();
  const buffer = await streamToBuffer(response.Body as NodeJS.ReadableStream);
  const streamTime = Date.now() - streamStartTime;

  const totalTime = Date.now() - startTime;
  console.log(
    `[S3] 下载完成: ${storageKey.split("/").pop()} - ${(
      buffer.length / 1024
    ).toFixed(
      2
    )}KB - 请求: ${requestTime}ms, 流: ${streamTime}ms, 总: ${totalTime}ms`
  );

  return buffer;
}

export async function uploadObject(input: {
  storageKey: string;
  body: Buffer;
  contentType: string;
}): Promise<{ publicUrl: string; size: number }> {
  const startTime = Date.now();
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType,
  });

  const uploadStartTime = Date.now();
  await s3.send(command);
  const uploadTime = Date.now() - uploadStartTime;

  const totalTime = Date.now() - startTime;
  const speedKBps = input.body.length / 1024 / (totalTime / 1000);

  console.log(
    `[S3] 上传完成: ${input.storageKey.split("/").pop()} - ${(
      input.body.length / 1024
    ).toFixed(
      2
    )}KB - 上传: ${uploadTime}ms, 总: ${totalTime}ms, 速度: ${speedKBps.toFixed(
      2
    )}KB/s`
  );

  return {
    publicUrl: `${config.s3PublicBaseUrl}/${input.storageKey}`,
    size: input.body.length,
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
