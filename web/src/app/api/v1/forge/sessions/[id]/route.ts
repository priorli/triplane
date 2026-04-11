import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { removeWorktree, worktreeExists } from "@/lib/forge/worktree";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;
    const session = sessionStore.get(sessionId);
    if (!session) {
      return fail("NOT_FOUND", "session not found", 404);
    }
    return ok({
      sessionId: session.sessionId,
      status: session.status,
      worktreePath: session.worktreePath,
      worktreeExists: worktreeExists(session.sessionId),
      eventCount: session.events.length,
      pendingApprovalCount: session.pendingApprovals.size,
      errorMessage: session.errorMessage,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      inputs: {
        slug: session.inputs.slug,
        displayName: session.inputs.displayName,
        productName: session.inputs.productName,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();
    const { id: sessionId } = await params;
    const session = sessionStore.get(sessionId);
    if (!session) {
      return fail("NOT_FOUND", "session not found", 404);
    }

    const wasRunning = session.abortController !== null;
    sessionStore.abort(sessionId, "session discarded via DELETE");
    sessionStore.appendEvent(sessionId, "status", { status: "discarded" });
    session.status = "discarded";

    try {
      await removeWorktree(sessionId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return fail("WORKTREE_REMOVE_FAILED", message, 500);
    }

    sessionStore.remove(sessionId);

    return ok({ sessionId, discarded: true, wasRunning });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
