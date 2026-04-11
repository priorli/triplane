import { ok, fail } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  buildAttachmentStorageKey,
  getPresignedPutUrl,
  PRESIGN_WRITE_EXPIRES_IN,
} from "@/lib/tigris";
import { presignRequestSchema } from "@/lib/openapi/responses";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }

    const { fileName, fileType, fileSize } = parsed.data;
    const storageKey = buildAttachmentStorageKey(userId, fileName);
    const uploadUrl = await getPresignedPutUrl(storageKey, fileType, fileSize);

    return ok({
      uploadUrl,
      storageKey,
      expiresIn: PRESIGN_WRITE_EXPIRES_IN,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
