import { auth } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

/**
 * Require an authenticated user. Throws a 401 Response if not authenticated.
 *
 * Lazily upserts the user into the local DB so that the first authenticated
 * request creates the row even if the Clerk webhook hasn't fired yet.
 *
 * Use this helper at the top of every protected API route handler.
 */
export async function requireUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Response(
      JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: `${userId}@placeholder.clerk` },
    update: {},
  });

  return { userId };
}

/**
 * Generic ownership assertion helper. Pass an async function that loads the
 * resource and returns `{ userId, deletedAt }`. Throws 404 if not found, not
 * owned, or soft-deleted.
 *
 * Use this pattern instead of writing per-entity assertOwnership helpers in
 * advance — write the helper next to the entity when you add it.
 *
 * @example
 * await assertOwnership(itemId, userId, async (id) => {
 *   const item = await prisma.item.findUnique({
 *     where: { id },
 *     select: { userId: true, deletedAt: true },
 *   });
 *   return item;
 * });
 */
export async function assertOwnership(
  resourceId: string,
  userId: string,
  loader: (id: string) => Promise<{ userId: string; deletedAt: Date | null } | null>,
  resourceName: string = "Resource",
) {
  const resource = await loader(resourceId);
  if (!resource || resource.userId !== userId || resource.deletedAt) {
    throw new Response(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: `${resourceName} not found` },
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Check if a user is a superadmin. Used for the dev-promote bypass and any
 * unrestricted admin operations.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "superadmin";
}

/**
 * Throw 403 if the user is not a superadmin. Use at the top of admin-only routes.
 */
export async function requireSuperAdmin(userId: string): Promise<void> {
  if (!(await isSuperAdmin(userId))) {
    throw new Response(
      JSON.stringify({
        error: { code: "FORBIDDEN", message: "Superadmin required" },
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
