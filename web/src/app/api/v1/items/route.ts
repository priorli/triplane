import { ok, fail } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/items";
import { createItemRequestSchema } from "@/lib/openapi/responses";

export async function GET() {
  try {
    const { userId } = await requireUser();

    const items = await prisma.item.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const serialized = await Promise.all(items.map((item) => serializeItem(item)));
    return ok({ items: serialized });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json();
    const parsed = createItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }

    const created = await prisma.item.create({
      data: {
        userId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
      },
      include: { attachments: true },
    });

    return ok({ item: await serializeItem(created) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
