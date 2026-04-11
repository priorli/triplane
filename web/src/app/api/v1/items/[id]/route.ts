import { ok, fail } from "@/lib/api-response";
import { assertOwnership, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/items";
import { updateItemRequestSchema } from "@/lib/openapi/responses";

async function loadItemOwnership(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: { userId: true, deletedAt: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await assertOwnership(id, userId, loadItemOwnership, "Item");

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!item) return fail("NOT_FOUND", "Item not found", 404);

    return ok({ item: await serializeItem(item) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await assertOwnership(id, userId, loadItemOwnership, "Item");

    const body = await request.json();
    const parsed = updateItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }

    const updated = await prisma.item.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
      },
      include: {
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return ok({ item: await serializeItem(updated) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();
    await assertOwnership(id, userId, loadItemOwnership, "Item");

    await prisma.item.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
