import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const s3Region = config.s3Region === "us-east-1" ? "auto" : config.s3Region;

const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: s3Region,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey,
  },
  forcePathStyle: true,
});

export type SignedUpload = {
  signedUrl: string;
  storageKey: string;
  publicUrl: string;
};

export async function createReceiptUploadUrl(input: {
  userId: string;
  projectId: string;
  receiptId: string;
  extension: string;
  contentType: string;
}): Promise<SignedUpload> {
  const storageKey = `users/${input.userId}/projects/${input.projectId}/receipts/${input.receiptId}.${input.extension}`;
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: storageKey,
    ContentType: input.contentType,
  });
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const publicUrl = `${config.s3PublicBaseUrl}/${storageKey}`;
  return { signedUrl, storageKey, publicUrl };
}

export async function createReceiptDownloadUrl(input: {
  storageKey: string;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: input.storageKey,
  });
  return getSignedUrl(s3, command, { expiresIn: 900 });
}
