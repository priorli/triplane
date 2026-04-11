import type { Attachment as PrismaAttachment, Item as PrismaItem } from "@/generated/prisma/client";
import { getPresignedReadUrl, PRESIGN_READ_EXPIRES_IN } from "./tigris";
import type { Attachment, Item } from "./items-types";

export const IMAGE_MIME_WHITELIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_WHITELIST)[number];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;  // 10 MB

export function isAllowedMimeType(value: string): value is ImageMimeType {
  return (IMAGE_MIME_WHITELIST as readonly string[]).includes(value);
}

export async function serializeAttachment(
  attachment: PrismaAttachment,
): Promise<Attachment> {
  const url = await getPresignedReadUrl(attachment.storageKey);
  const urlExpiresAt = new Date(Date.now() + PRESIGN_READ_EXPIRES_IN * 1000);
  return {
    id: attachment.id,
    itemId: attachment.itemId,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    url,
    urlExpiresAt: urlExpiresAt.toISOString(),
    createdAt: attachment.createdAt.toISOString(),
  };
}

export async function serializeItem(
  item: PrismaItem & { attachments: PrismaAttachment[] },
): Promise<Item> {
  const attachments = await Promise.all(
    item.attachments.map((a) => serializeAttachment(a)),
  );
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    attachments,
  };
}
