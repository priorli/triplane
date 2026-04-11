import { ok } from "@/lib/api-response";
import { assertOwnership, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function loadAttachmentOwnership(id: string) {
  return prisma.attachment.findUnique({
    where: { id },
    select: { userId: true, deletedAt: true },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await assertOwnership(id, userId, loadAttachmentOwnership, "Attachment");

    await prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
