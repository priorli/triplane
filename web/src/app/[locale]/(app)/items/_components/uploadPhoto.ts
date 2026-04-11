import type { Attachment } from "@/lib/items-types";

type ApiSuccess<T> = { data: T };

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiSuccess<T> | { error: { message: string } };
  if (!res.ok || "error" in body) {
    const message = "error" in body ? body.error.message : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body.data;
}

/**
 * Presigned-upload flow used by both the create dialog and the item detail
 * "add photos" button:
 *   1. POST /api/v1/attachments/presign → { uploadUrl, storageKey }
 *   2. PUT the bytes to Tigris (client → storage, no API in the path)
 *   3. POST /api/v1/attachments to persist metadata → Attachment
 */
export async function uploadPhoto(itemId: string, file: File): Promise<Attachment> {
  // Step 1: presign
  const presignRes = await fetch("/api/v1/attachments/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });
  const { uploadUrl, storageKey } = await parseJson<{
    uploadUrl: string;
    storageKey: string;
    expiresIn: number;
  }>(presignRes);

  // Step 2: PUT bytes directly to Tigris using the presigned URL
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: HTTP ${putRes.status}`);
  }

  // Step 3: save metadata
  const saveRes = await fetch("/api/v1/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId,
      storageKey,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });
  const { attachment } = await parseJson<{ attachment: Attachment }>(saveRes);
  return attachment;
}
