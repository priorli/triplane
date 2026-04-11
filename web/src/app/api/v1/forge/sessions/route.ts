import { ok, fail } from "@/lib/api-response";
import { sessionStore } from "@/lib/forge/session-store";
import { createWorktree, removeWorktree } from "@/lib/forge/worktree";
import { writeIdeaMdToWorktree } from "@/lib/forge/idea-md-writer";
import { createSessionRequestSchema } from "@/lib/forge/schemas";
import { startWorker } from "@/lib/forge/worker";
import { requireForgeUser } from "@/lib/forge/auth";

export async function POST(request: Request) {
  try {
    const { userId } = await requireForgeUser();

    const body = await request.json();
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", parsed.error.message, 400);
    }
    const input = parsed.data;

    const state = sessionStore.create({
      userId,
      worktreePath: "",
      inputs: {
        productName: input.productName,
        tagline: input.tagline,
        description: input.description,
        targetUser: input.targetUser,
        features: input.features,
        slug: input.slug,
        namespace: input.namespace,
        displayName: input.displayName,
        brandColor: input.brandColor,
      },
    });

    let worktree;
    try {
      worktree = await createWorktree(state.sessionId);
    } catch (e) {
      sessionStore.remove(state.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("WORKTREE_CREATE_FAILED", message, 500);
    }

    state.worktreePath = worktree.path;

    try {
      await writeIdeaMdToWorktree(worktree.path, {
        productName: input.productName,
        tagline: input.tagline,
        description: input.description,
        targetUser: input.targetUser,
        features: input.features,
        suggestedSlug: input.slug,
      });
    } catch (e) {
      await removeWorktree(state.sessionId);
      sessionStore.remove(state.sessionId);
      const message = e instanceof Error ? e.message : String(e);
      return fail("IDEA_WRITE_FAILED", message, 500);
    }

    sessionStore.setStatus(state.sessionId, "idea_written");

    // Kick off the worker (fire and forget — returns immediately).
    // The worker builds a /init-app trigger prompt from the form inputs.
    startWorker({
      sessionId: state.sessionId,
      worktreePath: worktree.path,
      inputs: state.inputs,
    });

    return ok(
      {
        sessionId: state.sessionId,
        status: state.status,
        worktreePath: state.worktreePath,
        eventsUrl: `/api/v1/forge/sessions/${state.sessionId}/events`,
        createdAt: state.createdAt.toISOString(),
      },
      201,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function GET() {
  try {
    await requireForgeUser();
    const sessions = sessionStore.all().map((s) => ({
      sessionId: s.sessionId,
      status: s.status,
      worktreePath: s.worktreePath,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
    return ok({ sessions });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
