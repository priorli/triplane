import { ok, fail } from "@/lib/api-response";
import { assertOwnership, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeAttachment } from "@/lib/items";
import { createAttachmentRequestSchema } from "@/lib/openapi/responses";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const parsed = createAttachmentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }

    const { itemId, storageKey, fileName, fileType, fileSize } = parsed.data;

    await assertOwnership(
      itemId,
      userId,
      (id) =>
        prisma.item.findUnique({
          where: { id },
          select: { userId: true, deletedAt: true },
        }),
      "Item",
    );

    const attachment = await prisma.attachment.create({
      data: {
        userId,
        itemId,
        fileName,
        fileType,
        fileSize,
        storageKey,
      },
    });

    return ok({ attachment: await serializeAttachment(attachment) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
