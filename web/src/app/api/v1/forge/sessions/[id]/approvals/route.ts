import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { approvalDecisionSchema } from "@/lib/forge/schemas";
import { requireForgeUser } from "@/lib/forge/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireForgeUser();

    const { id: sessionId } = await params;
    const session = sessionStore.get(sessionId);
    if (!session) {
      return fail("NOT_FOUND", "session not found", 404);
    }

    const body = await request.json();
    const parsed = approvalDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }
    const { approvalId, decision, note } = parsed.data;

    const resolved = sessionStore.resolveApproval(sessionId, approvalId, {
      approved: decision === "approved",
      note,
    });

    if (!resolved) {
      return fail(
        "APPROVAL_NOT_FOUND",
        `no pending approval with id ${approvalId} for session ${sessionId}`,
        404,
      );
    }

    sessionStore.appendEvent(sessionId, "approval_resolved", {
      approvalId,
      decision,
      note,
    });

    return ok({ approvalId, decision });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
