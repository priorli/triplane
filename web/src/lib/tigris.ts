import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const globalForS3 = globalThis as unknown as { s3Client: S3Client };

export const s3Client = (globalForS3.s3Client ??= new S3Client({
  region: "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
}));

export const BUCKET = process.env.TIGRIS_BUCKET_NAME!;

export const PRESIGN_READ_EXPIRES_IN = 3600;  // 1 hour
export const PRESIGN_WRITE_EXPIRES_IN = 900;  // 15 minutes

/** Generate a presigned GET URL valid for 1 hour */
export async function getPresignedReadUrl(storageKey: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: storageKey });
  return getSignedUrl(s3Client, command, { expiresIn: PRESIGN_READ_EXPIRES_IN });
}

/**
 * Generate a presigned PUT URL the client can use to upload directly to Tigris.
 * Binds ContentType and ContentLength so the client cannot lie about either
 * without invalidating the signature.
 */
export async function getPresignedPutUrl(
  storageKey: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(s3Client, command, { expiresIn: PRESIGN_WRITE_EXPIRES_IN });
}

export async function deleteObject(storageKey: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey })
  );
}

/**
 * Build an opaque storage key for an attachment. Shape:
 *   attachments/<userId>/<uuid>.<ext>
 * The userId prefix keeps Tigris console browsing organized and makes it easy
 * to apply per-user lifecycle rules later. The uuid prevents collision and
 * keeps the filename unguessable.
 */
export function buildAttachmentStorageKey(userId: string, fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "bin";
  return `attachments/${userId}/${randomUUID()}.${ext}`;
}
